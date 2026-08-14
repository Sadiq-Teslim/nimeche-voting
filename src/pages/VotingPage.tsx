/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Redirect } from "wouter";
import { ArrowLeft, Check, CheckCircle2, ImageIcon, Loader2, Search, Send, ShieldCheck, Trophy } from "lucide-react";
import ImageZoomModal from "../components/ImageZoomModal";
import { api, assetUrl } from "../api/client";
import { organization } from "../config/organization";
import type { VoterInfo } from "../App";
import { generateFingerprint } from "../utils/fingerprint";
import { retryWithBackoff } from "../utils/retry";

export interface Nominee {
  id: string;
  name: string;
  image: string | null;
  description?: string;
}

export interface Category {
  id: string;
  title: string;
  groupKey?: string;
  nominees: Nominee[];
}

interface BallotGroup {
  id: string;
  label: string;
  categories: Category[];
}

type Selections = Record<string, string>;

const brand = {
  background: "#0A0D0A",
  panel: "rgba(13, 22, 10, 0.9)",
  panelStrong: "#0D160A",
  orange: "#E8650A",
  green: "#2E7D32",
  gold: "#F5A623",
  text: "#F2EDE8",
  secondary: "#BDD0BE",
  muted: "#7A9A7C",
  border: "rgba(232, 101, 10, 0.3)",
};

let cachedCsrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  const response = await retryWithBackoff(() => api.get("/csrf-token"));
  cachedCsrfToken = response.data.csrfToken;
  return cachedCsrfToken as string;
}

async function postVotesWithFreshCsrf(payload: unknown, voterToken: string) {
  const csrfToken = await getCsrfToken();
  try {
    return await retryWithBackoff(() =>
      api.post("/submit-votes", payload, { headers: { "X-CSRF-Token": csrfToken, "X-Voter-Token": voterToken } }),
    );
  } catch (error: any) {
    if (error.response?.status !== 403) throw error;
    cachedCsrfToken = null;
    const freshToken = await getCsrfToken();
    return retryWithBackoff(() =>
      api.post("/submit-votes", payload, { headers: { "X-CSRF-Token": freshToken, "X-Voter-Token": voterToken } }),
    );
  }
}

const SuccessModal = ({ isOpen, message, onClose }: { isOpen: boolean; message: string; onClose: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-lg border p-6 text-center shadow-2xl sm:p-8" style={{ backgroundColor: brand.panelStrong, borderColor: brand.border }}>
        <ShieldCheck className="mx-auto mb-4 h-14 w-14" style={{ color: brand.gold }} />
        <h2 className="text-2xl font-bold" style={{ color: brand.text }}>Votes Recorded</h2>
        <p className="mt-3 leading-6" style={{ color: brand.secondary }}>{message}</p>
        <button type="button" onClick={onClose} className="mt-7 min-h-12 w-full rounded-md px-5 py-3 font-bold text-white" style={{ backgroundColor: brand.orange }}>
          Return to Ballot
        </button>
      </div>
    </div>
  );
};

const CandidateCard = ({ nominee, selected, disabled, onSelect, onImageClick }: {
  nominee: Nominee;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onImageClick: () => void;
}) => {
  const imageSrc = nominee.image
    ? nominee.image.startsWith("http") ? nominee.image : `/nominees/${nominee.image}`
    : "/placeholder.png";

  return (
    <article
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-lg border transition-colors ${disabled ? "opacity-65" : "hover:border-[#E8650A]"}`}
      style={{ backgroundColor: selected ? "rgba(232, 101, 10, 0.12)" : brand.panel, borderColor: selected ? brand.orange : brand.border }}
    >
      <button type="button" onClick={onImageClick} disabled={!nominee.image} className="relative aspect-[4/3] w-full overflow-hidden bg-black/30 disabled:cursor-default" aria-label={nominee.image ? `View ${nominee.name}'s photo` : undefined}>
        <img src={imageSrc} alt={nominee.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
        {nominee.image && <span className="absolute bottom-2 right-2 rounded-full bg-black/70 p-2 text-white"><ImageIcon size={16} /></span>}
      </button>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="break-words text-base font-bold" style={{ color: brand.text }}>{nominee.name}</h3>
        {nominee.description && <p className="mt-1 text-sm leading-5" style={{ color: brand.muted }}>{nominee.description}</p>}
        <button
          type="button"
          onClick={onSelect}
          disabled={disabled}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed"
          style={{ backgroundColor: selected ? brand.orange : "rgba(0,0,0,0.28)", borderColor: selected ? brand.orange : brand.border, color: selected ? "white" : brand.secondary }}
        >
          {disabled ? <><Check size={16} /> Voted</> : selected ? <><CheckCircle2 size={16} /> Selected</> : "Select Nominee"}
        </button>
      </div>
    </article>
  );
};

const VotingPage: React.FC<{ voter: VoterInfo; groupKey: string }> = ({ voter, groupKey }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [votedCategoryIds, setVotedCategoryIds] = useState<string[]>([]);
  const [selections, setSelections] = useState<Selections>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [zoomedNominee, setZoomedNominee] = useState<Nominee | null>(null);
  const fingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    const groupLabel = organization.categoryGroups[groupKey as keyof typeof organization.categoryGroups];
    document.title = `${groupLabel || organization.electionTitle} | Voting`;
    const fetchBallot = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [ballotResponse, fingerprint] = await Promise.all([
          retryWithBackoff(() => api.get("/ballot")),
          generateFingerprint(),
        ]);
        fingerprintRef.current = fingerprint;
        const votedResponse = await retryWithBackoff(() => api.get("/voted-categories", { headers: { "X-Voter-Token": voter.voterToken } }));
        const departmentCategories = (ballotResponse.data.departments || []).flatMap((department: any) => department.subcategories || []);
        setCategories([...(ballotResponse.data.categories || []), ...departmentCategories]);
        setVotedCategoryIds(votedResponse.data.votedCategoryIds || []);
      } catch {
        setError("Could not load the NIMechE ballot. Please refresh and try again.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchBallot();
  }, [groupKey, voter.voterToken]);

  const ballotGroups = useMemo<BallotGroup[]>(() => {
    const groupLabels = organization.categoryGroups || {};
    const groups = new Map<string, Category[]>();
    for (const category of categories.filter((item) => item.groupKey === groupKey)) {
      const groupKey = category.groupKey || "other";
      const items = groups.get(groupKey) || [];
      items.push(category);
      groups.set(groupKey, items);
    }
    const configuredOrder = Object.keys(groupLabels);
    return [...groups.entries()]
      .sort(([left], [right]) => {
        const leftIndex = configuredOrder.indexOf(left);
        const rightIndex = configuredOrder.indexOf(right);
        if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      })
      .map(([id, groupedCategories]) => ({
        id,
        label: groupLabels[id] || `${id.charAt(0).toUpperCase()}${id.slice(1)} Awards`,
        categories: groupedCategories,
      }));
  }, [categories, groupKey]);

  const filteredGroups = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return ballotGroups;
    return ballotGroups
      .map((group) => ({
        ...group,
        categories: group.categories.filter((category) =>
          category.title.toLowerCase().includes(query) || category.nominees.some((nominee) => nominee.name.toLowerCase().includes(query)),
        ),
      }))
      .filter((group) => group.categories.length > 0);
  }, [ballotGroups, searchTerm]);

  const visibleCategories = categories.filter((category) => category.groupKey === groupKey);
  const availableCategoryCount = visibleCategories.filter((category) => category.nominees.length > 0).length;
  const completedCount = visibleCategories.filter((category) => votedCategoryIds.includes(category.id)).length;
  const selectionCount = Object.keys(selections).length;

  const handleSelectNominee = (categoryId: string, candidateId: string) => {
    if (votedCategoryIds.includes(categoryId)) return;
    setSubmissionError(null);
    setSelections((current) => ({ ...current, [categoryId]: candidateId }));
  };

  const handleSubmitVotes = async () => {
    if (selectionCount === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const fingerprint = fingerprintRef.current || (await generateFingerprint());
      fingerprintRef.current = fingerprint;
      const response = await postVotesWithFreshCsrf({
        fingerprint,
        department: organization.fixedDepartmentId || voter.department,
        choices: Object.entries(selections).map(([categoryId, candidateId]) => ({ categoryId, candidateId })),
      }, voter.voterToken);
      setVotedCategoryIds(response.data.votedCategoryIds || []);
      setSelections({});
      const recordedCount = response.data.recorded?.length || 0;
      const skippedCount = response.data.skipped?.length || 0;
      if (recordedCount === 0 && skippedCount > 0) setSuccessMessage("You have already voted in those awards.");
      else if (skippedCount > 0) setSuccessMessage(`${recordedCount} vote(s) recorded. ${skippedCount} previously completed award(s) were skipped.`);
      else setSuccessMessage(`${recordedCount} vote(s) recorded successfully.`);
      setIsSuccessOpen(true);
    } catch (submitError: any) {
      setSubmissionError(submitError.response?.data?.message || "Votes could not be submitted. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!voter.fullName || !voter.voterToken) return <Redirect to="/" />;
  if (!(groupKey in organization.categoryGroups)) return <Redirect to="/vote" />;
  const currentGroupLabel = organization.categoryGroups[groupKey as keyof typeof organization.categoryGroups];
  const backgroundImage = organization.nominationBackground ? `url("${assetUrl(organization.nominationBackground)}")` : undefined;

  if (isLoading) return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4" style={{ backgroundColor: brand.background }}>
      <div aria-hidden="true" className="fixed inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage }} />
      <div className="relative z-10 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin" style={{ color: brand.orange }} />
        <h1 className="mt-5 text-2xl font-bold" style={{ color: brand.text }}>Preparing Your Ballot</h1>
        <p className="mt-2" style={{ color: brand.secondary }}>Loading approved nominees...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex min-h-screen w-full items-center justify-center p-4" style={{ backgroundColor: brand.background }}>
      <div className="max-w-md rounded-lg border border-red-400/30 bg-red-950/40 p-6 text-center text-red-200">
        <h1 className="text-xl font-bold">Ballot Unavailable</h1>
        <p className="mt-2">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden pb-32" style={{ backgroundColor: brand.background }}>
      <div aria-hidden="true" className="fixed inset-0 bg-cover bg-center bg-no-repeat opacity-20" style={{ backgroundImage }} />
      <div aria-hidden="true" className="fixed inset-0 bg-[rgba(10,13,10,0.88)]" />
      <SuccessModal isOpen={isSuccessOpen} message={successMessage} onClose={() => { setIsSuccessOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      <ImageZoomModal nominee={zoomedNominee} onClose={() => setZoomedNominee(null)} />

      <header className="sticky top-0 z-30 border-b bg-[#0A0D0A]/95 backdrop-blur-md" style={{ borderColor: brand.border }}>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/vote" aria-label="Back to voting categories" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-white/5" style={{ borderColor: brand.border, color: brand.secondary }}>
              <ArrowLeft size={19} />
            </Link>
            <img src={assetUrl(organization.logo)} alt="" className="h-10 w-10 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold" style={{ color: brand.text }}>{organization.shortName}</p>
              <p className="truncate text-xs" style={{ color: brand.muted }}>{currentGroupLabel}</p>
            </div>
          </div>
          <label className="relative block w-full sm:max-w-sm">
            <span className="sr-only">Search awards or nominees</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: brand.muted }} />
            <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search awards or nominees" className="min-h-11 w-full rounded-md border bg-black/30 py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#E8650A]/35" style={{ borderColor: brand.border, color: brand.text }} />
          </label>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-12">
        <section className="border-b pb-8" style={{ borderColor: brand.border }}>
          <Link href="/vote" className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: brand.gold }}><ArrowLeft size={17} /> All voting categories</Link>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: brand.orange }}>Official Ballot</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-5xl" style={{ color: brand.text }}>{currentGroupLabel}</h1>
          <p className="mt-3 max-w-2xl leading-7" style={{ color: brand.secondary }}>
            Welcome, <span className="font-bold" style={{ color: brand.text }}>{voter.fullName}</span>. Select one nominee for each award you want to complete, then submit this ballot.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span className="rounded-md border px-3 py-2" style={{ borderColor: brand.border, color: brand.secondary }}>{availableCategoryCount} awards with nominees</span>
            <span className="rounded-md border px-3 py-2" style={{ borderColor: brand.border, color: brand.secondary }}>{completedCount} completed by you</span>
          </div>
        </section>

        {filteredGroups.length > 0 ? (
          <div className="mt-10 space-y-14">
            {filteredGroups.map((group) => (
              <section key={group.id} aria-labelledby={`group-${group.id}`}>
                <div className="mb-6 flex items-end justify-between gap-4 border-b pb-4" style={{ borderColor: brand.border }}>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: brand.orange }}>{group.categories.length} awards</p>
                    <h2 id={`group-${group.id}`} className="mt-1 text-2xl font-bold sm:text-3xl" style={{ color: brand.text }}>{group.label}</h2>
                  </div>
                  <Trophy className="h-7 w-7 shrink-0" style={{ color: brand.gold }} />
                </div>
                <div className="space-y-8">
                  {group.categories.map((category) => {
                    const voted = votedCategoryIds.includes(category.id);
                    return (
                      <article key={category.id} className="rounded-lg border p-4 sm:p-6" style={{ backgroundColor: "rgba(8,14,7,0.72)", borderColor: brand.border }}>
                        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-bold" style={{ color: brand.text }}>{category.title}</h3>
                            <p className="mt-1 text-sm" style={{ color: brand.muted }}>{voted ? "You have completed this award" : `${category.nominees.length} approved nominee${category.nominees.length === 1 ? "" : "s"}`}</p>
                          </div>
                          {voted && <span className="inline-flex items-center gap-1.5 rounded-md bg-[#2E7D32]/20 px-3 py-1.5 text-xs font-bold text-green-300"><Check size={15} /> Completed</span>}
                        </div>
                        {category.nominees.length > 0 ? (
                          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {category.nominees.map((nominee) => (
                              <CandidateCard key={nominee.id} nominee={nominee} selected={selections[category.id] === nominee.id} disabled={voted} onSelect={() => handleSelectNominee(category.id, nominee.id)} onImageClick={() => nominee.image && setZoomedNominee(nominee)} />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed px-4 py-8 text-center" style={{ borderColor: brand.border, color: brand.muted }}>No approved nominees yet.</div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center" style={{ color: brand.muted }}>No awards or nominees match “{searchTerm}”.</div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-30 border-t bg-[#0A0D0A]/95 p-3 backdrop-blur-md sm:p-4" style={{ borderColor: brand.border }}>
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: brand.text }}>Your Ballot</p>
            <p className="truncate text-xs sm:text-sm" style={{ color: brand.gold }}>{selectionCount} vote(s) selected</p>
            {submissionError && <p className="mt-1 max-w-xl text-xs text-red-300">{submissionError}</p>}
          </div>
          <button type="button" onClick={handleSubmitVotes} disabled={selectionCount === 0 || isSubmitting} className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45 sm:px-7 sm:text-base" style={{ backgroundColor: selectionCount > 0 ? brand.orange : "#4A5148" }}>
            {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            <span className="hidden sm:inline">{isSubmitting ? "Submitting..." : `Submit ${selectionCount} Vote(s)`}</span>
            <span className="sm:hidden">{isSubmitting ? "Sending" : `Submit ${selectionCount}`}</span>
          </button>
        </div>
      </footer>
    </div>
  );
};

export default VotingPage;
