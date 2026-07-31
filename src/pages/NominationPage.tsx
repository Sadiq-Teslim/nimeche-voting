// src/pages/NominationPage.tsx  (nimeche build)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Send,
  Loader2,
  CheckCircle,
  UploadCloud,
  PlusCircle,
  Trash2,
  Home,
} from "lucide-react";
import { api, assetUrl } from "../api/client";
import { organization } from "../config/organization";

// --- TypeScript Types ---
interface SubCategory {
  id: string;
  title: string;
  groupKey?: string;
}
interface DepartmentData {
  id: string;
  title: string;
  subcategories: SubCategory[];
}
interface AwardGroup {
  id: string;
  label: string;
  awards: SubCategory[];
}
interface NominationFormState {
  id: number;
  firstName: string;
  lastName: string;
  level: string; // academic level — required for Department Awards
  mainCategory: string;
  subCategory: string;
  imageFile?: File;
  imagePreviewUrl?: string;
}

const LEVELS = ["100", "200", "300", "400", "500"];

const emptyForm = (): NominationFormState => ({
  id: Date.now() + Math.random(),
  firstName: "",
  lastName: "",
  level: "",
  mainCategory: "",
  subCategory: "",
});

// ── colour tokens (NIMECHE brand) ────────────────────────────────────────────
const c = {
  bg: "#0A0D0A",
  card: "rgba(13,22,10,0.92)",
  borderDefault: "rgba(232,101,10,0.35)",
  borderInput: "#6B3A0A",
  primary: "#E8650A",
  primaryHover: "#CF5A09",
  primaryDisabled: "#7A3505",
  accent: "#F5A623",
  textPrimary: "#F2EDE8",
  textSecondary: "#C0D0B8",
  textMuted: "#8FA88A",
  inputBg: "rgba(8,13,8,0.9)",
  focusBorder: "#F5A623",
  focusRing: "rgba(245,166,35,0.25)",
};

const inputCls =
  "w-full rounded-md border p-3 text-[#F2EDE8] outline-none transition-colors placeholder:text-[#6A826A] focus:ring-2";
const inputStyle = {
  borderColor: c.borderInput,
  backgroundColor: c.inputBg,
};
const inputFocusStyle = (focused: boolean) =>
  focused
    ? { borderColor: c.focusBorder, boxShadow: `0 0 0 2px ${c.focusRing}` }
    : {};

// Controlled input with focus-based ring (plain CSS variables not available in
// tailwind-only builds, so we use inline style for focus ring here)
function Field({
  label,
  id,
  name,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  id: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium" style={{ color: c.textSecondary }}>
        {label} {required && <span style={{ color: c.accent }}>*</span>}
      </label>
      <input
        type="text"
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={inputCls}
        style={{ ...inputStyle, ...inputFocusStyle(focused) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

function SelectField({
  label,
  id,
  name,
  value,
  onChange,
  disabled,
  required,
  children,
}: {
  label: string;
  id: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium" style={{ color: c.textSecondary }}>
        {label} {required && <span style={{ color: c.accent }}>*</span>}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-50`}
        style={{ ...inputStyle, ...inputFocusStyle(focused) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {children}
      </select>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

const NominationPage = () => {
  const [awardGroups, setAwardGroups] = useState<AwardGroup[]>([]);
  const [nominationForms, setNominationForms] = useState<NominationFormState[]>([emptyForm()]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  // NIMECHE has no nomination background image
  const pageBackdrop = (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(46,125,50,0.18) 0%, transparent 70%), " +
            "radial-gradient(ellipse 60% 40% at 100% 100%, rgba(232,101,10,0.10) 0%, transparent 70%)",
        }}
      />
    </>
  );

  useEffect(() => {
    document.title = `${organization.electionTitle} | Nominations`;
    api
      .get("/ballot")
      .then((res) => {
        const jsonData = res.data;
        const groupedAwards = new Map<string, SubCategory[]>();
        jsonData.categories.forEach((cat: SubCategory) => {
          const groupKey = cat.groupKey || "general";
          const awards = groupedAwards.get(groupKey) || [];
          awards.push(cat);
          groupedAwards.set(groupKey, awards);
        });
        const deptData: DepartmentData[] = jsonData.departments.map(
          (dept: any) => ({
            id: dept.id,
            title: dept.title.replace("Departmental Awards - ", ""),
            subcategories: dept.subcategories,
          })
        );
        const configuredLabels = organization.categoryGroups || {};
        const groups: AwardGroup[] = Array.from(groupedAwards.entries()).map(
          ([id, awards]) => ({
            id,
            label:
              configuredLabels[id] ||
              `${id.charAt(0).toUpperCase()}${id.slice(1)} Awards`,
            awards,
          }),
        );
        deptData.forEach((department) => {
          if (department.subcategories.length > 0) {
            groups.push({
              id: `department-${department.id}`,
              label: `Departmental Awards - ${department.title}`,
              awards: department.subcategories,
            });
          }
        });
        setAwardGroups(groups);
      })
      .catch(() => {
        setStatus("error");
        setMessage("Could not load nomination categories. Please refresh and try again.");
      });
  }, []);

  const handleInputChange = (
    id: number,
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setNominationForms((forms) =>
      forms.map((form) => {
        if (form.id === id) {
          if (name === "mainCategory") {
            return { ...form, mainCategory: value, subCategory: "", level: "" };
          }
          return { ...form, [name]: value };
        }
        return form;
      })
    );
  };

  const handleFileChange = (id: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!["image/png", "image/jpeg"].includes(file.type)) {
        setStatus("error");
        setMessage("Please upload a PNG or JPG image.");
        e.target.value = "";
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setStatus("error");
        setMessage("Please upload an image smaller than 5MB.");
        e.target.value = "";
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setNominationForms((forms) =>
        forms.map((form) => {
          if (form.id !== id) return form;
          if (form.imagePreviewUrl) URL.revokeObjectURL(form.imagePreviewUrl);
          return { ...form, imageFile: file, imagePreviewUrl: previewUrl };
        })
      );
      setStatus("idle");
      setMessage("");
    }
  };

  const handleRemoveImage = (id: number) => {
    setNominationForms((forms) =>
      forms.map((form) => {
        if (form.id === id && form.imagePreviewUrl) {
          URL.revokeObjectURL(form.imagePreviewUrl);
          return { ...form, imageFile: undefined, imagePreviewUrl: undefined };
        }
        return form;
      })
    );
  };

  const addNominationForm = () => {
    setNominationForms((forms) => [...forms, emptyForm()]);
  };

  const removeNominationForm = (id: number) => {
    setNominationForms((forms) => forms.filter((form) => form.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const [index, form] of nominationForms.entries()) {
      const n = index + 1;
      if (!form.firstName.trim() || !form.lastName.trim()) {
        alert(`Please enter both first and last name for Nomination #${n}.`);
        return;
      }
      if (!form.mainCategory || !form.subCategory) {
        alert(`Please select a category and award for Nomination #${n}.`);
        return;
      }
      if (form.mainCategory === "department" && !form.level) {
        alert(`Please select the nominee's current level for Nomination #${n}.`);
        return;
      }
    }

    setStatus("loading");
    setMessage("Preparing nominations...");
    try {
      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
      const hasImageUploads = nominationForms.some((form) => form.imageFile);
      if (hasImageUploads && (!cloudName || !uploadPreset)) {
        throw new Error(
          "Image uploads are not configured yet. Add the Cloudinary env values and try again."
        );
      }

      const nominationsData = await Promise.all(
        nominationForms.map(async (form) => {
          let imageUrl;
          const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
          if (form.imageFile) {
            setMessage(`Uploading image for ${fullName}...`);
            const formData = new FormData();
            formData.append("file", form.imageFile);
            formData.append("upload_preset", uploadPreset);
            const uploadRes = await fetch(
              `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
              { method: "POST", body: formData }
            );
            if (!uploadRes.ok) throw new Error("Image upload failed.");
            const uploadData = await uploadRes.json();
            imageUrl = uploadData.secure_url;
          }
          return {
            fullName,
            // Store level in popularName so it appears in the admin panel
            popularName: form.level ? `Level ${form.level}` : undefined,
            category: form.subCategory,
            imageUrl,
          };
        })
      );

      setMessage("Finalizing submission...");
      await api.post("/nominate", { nominations: nominationsData });
      setStatus("success");
      setMessage("Your nomination has been submitted for review. Thank you.");
    } catch (err: any) {
      setStatus("error");
      setMessage(
        err.response?.data?.message || err.message || "An unexpected error occurred."
      );
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div
        className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6"
        style={{ backgroundColor: c.bg }}
      >
        {pageBackdrop}
        <main
          className="relative z-10 w-full max-w-xl px-5 py-10 text-center shadow-2xl backdrop-blur-md sm:px-10 sm:py-12 rounded-2xl border"
          style={{ backgroundColor: c.card, borderColor: c.borderDefault }}
        >
          <img
            src={assetUrl(organization.logo)}
            alt=""
            className="mx-auto mb-6 h-16 w-16 object-contain sm:h-20 sm:w-20"
          />
          <CheckCircle className="mx-auto mb-4 h-14 w-14" style={{ color: c.accent }} />
          <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: c.textPrimary }}>
            Submission Successful!
          </h1>
          <p className="mx-auto mt-3 max-w-md leading-7" style={{ color: c.textSecondary }}>
            {message}
          </p>
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={() => {
                setNominationForms([emptyForm()]);
                setStatus("idle");
              }}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-5 py-3 font-bold text-white transition-colors"
              style={{ backgroundColor: c.primary }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = c.primaryHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = c.primary)}
            >
              <PlusCircle size={20} /> Submit Another
            </button>
            <Link
              href="/"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border px-5 py-3 font-semibold transition-colors"
              style={{
                borderColor: `${c.primary}60`,
                backgroundColor: "rgba(0,0,0,0.3)",
                color: c.textPrimary,
              }}
            >
              <Home size={20} /> Back to Home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  return (
    <div
      className="relative min-h-screen w-full overflow-hidden text-white"
      style={{ backgroundColor: c.bg }}
    >
      {pageBackdrop}
      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Header */}
        <header className="mb-8 text-center sm:mb-10">
          <img
            src={assetUrl(organization.logo)}
            alt={organization.name}
            className="mx-auto mb-5 h-24 w-24 object-contain drop-shadow-xl sm:h-28 sm:w-28"
          />
          <h1 className="text-3xl font-bold sm:text-4xl" style={{ color: c.textPrimary }}>
            {organization.electionTitle} {organization.year}
          </h1>
          <p className="mt-3 text-base sm:text-lg" style={{ color: c.textSecondary }}>
            Fill in the details below to submit your nomination.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          {nominationForms.map((form, formIndex) => {
            const standardGroups = awardGroups.filter(
              (group) => !group.id.startsWith("department-"),
            );
            const departmentalGroups = awardGroups.filter((group) =>
              group.id.startsWith("department-"),
            );
            const selectedGroups =
              form.mainCategory === "departmental"
                ? departmentalGroups
                : standardGroups.filter((group) => group.id === form.mainCategory);

            const isDepartmentCategory = form.mainCategory === "department";

            return (
              <div
                key={form.id}
                className="relative rounded-2xl border p-5 shadow-2xl backdrop-blur-md sm:p-7"
                style={{ backgroundColor: c.card, borderColor: c.borderDefault }}
              >
                {/* Card heading */}
                <h3 className="mb-6 text-lg font-semibold" style={{ color: c.textPrimary }}>
                  {nominationForms.length > 1
                    ? `Nomination #${formIndex + 1}`
                    : "Nomination Details"}
                </h3>

                {/* Remove button */}
                {nominationForms.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeNominationForm(form.id)}
                    className="absolute right-4 top-4 rounded-full p-1.5 transition-colors hover:text-red-400"
                    style={{ color: c.textMuted }}
                    aria-label="Remove nomination"
                  >
                    <Trash2 size={18} />
                  </button>
                )}

                {/* ── Name: two columns ── */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="First Name"
                    id={`first-name-${form.id}`}
                    name="firstName"
                    value={form.firstName}
                    onChange={(e) => handleInputChange(form.id, e)}
                    placeholder="e.g. Aisha"
                    required
                  />
                  <Field
                    label="Last Name"
                    id={`last-name-${form.id}`}
                    name="lastName"
                    value={form.lastName}
                    onChange={(e) => handleInputChange(form.id, e)}
                    placeholder="e.g. Okonkwo"
                    required
                  />
                </div>

                {/* ── Category + Award ── */}
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <SelectField
                    label="Category"
                    id={`main-category-${form.id}`}
                    name="mainCategory"
                    value={form.mainCategory}
                    onChange={(e) => handleInputChange(form.id, e)}
                    required
                  >
                    <option value="">Select a category</option>
                    {standardGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.label}
                      </option>
                    ))}
                    {departmentalGroups.length > 0 && (
                      <option value="departmental">Departmental Awards</option>
                    )}
                  </SelectField>

                  <SelectField
                    label="Award"
                    id={`award-category-${form.id}`}
                    name="subCategory"
                    value={form.subCategory}
                    onChange={(e) => handleInputChange(form.id, e)}
                    required
                    disabled={!form.mainCategory}
                  >
                    <option value="">
                      {form.mainCategory ? "Select an award" : "Select a category first"}
                    </option>
                    {selectedGroups.map((group) =>
                      form.mainCategory === "departmental" ? (
                        <optgroup
                          key={group.id}
                          label={group.label.replace("Departmental Awards - ", "")}
                        >
                          {group.awards.map((award) => (
                            <option key={award.id} value={award.id}>
                              {award.title}
                            </option>
                          ))}
                        </optgroup>
                      ) : (
                        group.awards.map((award) => (
                          <option key={award.id} value={award.id}>
                            {award.title}
                          </option>
                        ))
                      ),
                    )}
                  </SelectField>
                </div>

                {/* ── Level selector (Department Awards only) ── */}
                {isDepartmentCategory && (
                  <div className="mt-4">
                    <SelectField
                      label="Nominee's Current Level"
                      id={`level-${form.id}`}
                      name="level"
                      value={form.level}
                      onChange={(e) => handleInputChange(form.id, e)}
                      required
                    >
                      <option value="">Select level</option>
                      {LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl} Level
                        </option>
                      ))}
                    </SelectField>
                    <p className="mt-1.5 text-xs" style={{ color: c.textMuted }}>
                      Select the academic level the nominee is currently in.
                    </p>
                  </div>
                )}

                {/* ── Photo upload ── */}
                <div className="mt-5">
                  <p className="mb-1.5 text-sm font-medium" style={{ color: c.textSecondary }}>
                    Photo{" "}
                    <span className="font-normal" style={{ color: c.textMuted }}>
                      (Optional)
                    </span>
                  </p>

                  {form.imagePreviewUrl ? (
                    <div
                      className="mt-2 flex justify-center rounded-xl border px-4 py-8 sm:px-6"
                      style={{ borderColor: c.borderDefault, backgroundColor: "rgba(0,0,0,0.2)" }}
                    >
                      <div className="relative text-center">
                        <img
                          src={form.imagePreviewUrl}
                          alt="Nominee preview"
                          className="mx-auto h-32 w-32 rounded-full object-cover border-2"
                          style={{ borderColor: c.accent }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(form.id)}
                          className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-500 text-white rounded-full p-1.5"
                          aria-label="Remove image"
                        >
                          <Trash2 size={16} />
                        </button>
                        <p
                          className="mx-auto mt-2 max-w-[15rem] truncate text-xs"
                          style={{ color: c.textMuted }}
                        >
                          {form.imageFile?.name}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor={`file-upload-${form.id}`}
                      className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition-colors sm:px-6"
                      style={{ borderColor: `${c.primary}55`, backgroundColor: "rgba(0,0,0,0.15)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = c.accent;
                        e.currentTarget.style.backgroundColor = `${c.primary}12`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = `${c.primary}55`;
                        e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.15)";
                      }}
                    >
                      <UploadCloud className="mx-auto h-10 w-10" style={{ color: c.accent }} />
                      <div className="mt-4 text-sm">
                        <span className="font-semibold" style={{ color: c.textPrimary }}>
                          Upload a file
                        </span>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: c.textMuted }}>
                        PNG, JPG up to 5MB
                      </p>
                      <input
                        id={`file-upload-${form.id}`}
                        type="file"
                        className="sr-only"
                        onChange={(e) => handleFileChange(form.id, e)}
                        accept="image/png, image/jpeg"
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── Footer actions ── */}
          <div
            className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: `${c.primary}30` }}
          >
            <button
              type="button"
              onClick={addNominationForm}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border px-5 py-3 font-semibold transition-colors"
              style={{
                borderColor: `${c.primary}45`,
                color: c.textPrimary,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${c.primary}15`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <PlusCircle size={20} /> Add Another Nomination
            </button>

            <button
              type="submit"
              disabled={status === "loading"}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-6 py-3 font-bold text-white transition-colors disabled:cursor-wait sm:w-auto"
              style={{
                backgroundColor: status === "loading" ? c.primaryDisabled : c.primary,
              }}
              onMouseEnter={(e) => {
                if (status !== "loading")
                  e.currentTarget.style.backgroundColor = c.primaryHover;
              }}
              onMouseLeave={(e) => {
                if (status !== "loading")
                  e.currentTarget.style.backgroundColor = c.primary;
              }}
            >
              {status === "loading" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Send />
              )}
              {status === "loading" ? "Submitting..." : "Submit Nominations"}
            </button>
          </div>

          {status === "loading" && (
            <p
              className="animate-pulse text-center text-sm"
              style={{ color: c.textSecondary }}
            >
              {message}
            </p>
          )}
          {status === "error" && (
            <p className="rounded-lg border border-red-300/25 bg-red-950/50 p-3 text-center text-sm text-red-200">
              {message}
            </p>
          )}
        </form>
      </main>
    </div>
  );
};

export default NominationPage;
