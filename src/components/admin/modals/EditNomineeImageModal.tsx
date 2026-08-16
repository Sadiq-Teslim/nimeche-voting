import React, { useEffect, useState } from "react";
import { Image, Loader2, Trash2, X } from "lucide-react";
import type { Nomination } from "../../../types/admin";

interface EditNomineeImageModalProps {
  nomination: Nomination | null;
  onClose: () => void;
  onSave: (nominationId: string, imageUrl: string) => Promise<void>;
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return "The photo could not be updated. Please try again.";
}

const EditNomineeImageModal: React.FC<EditNomineeImageModalProps> = ({ nomination, onClose, onSave }) => {
  const [imageUrl, setImageUrl] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setImageUrl(nomination?.imageUrl || "");
    setPreviewFailed(false);
    setError("");
  }, [nomination]);

  if (!nomination) return null;

  const save = async (nextUrl: string) => {
    const trimmed = nextUrl.trim();
    if (trimmed) {
      try {
        const parsed = new URL(trimmed);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      } catch {
        setError("Enter a valid http or https image URL.");
        return;
      }
    }

    setIsSaving(true);
    setError("");
    try {
      await onSave(nomination.id, trimmed);
      onClose();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-nominee-photo-title" onMouseDown={(event) => event.target === event.currentTarget && !isSaving && onClose()}>
      <div className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
          <div>
            <div className="flex items-center gap-2 text-amber-400"><Image size={20} /><span className="text-xs font-bold uppercase tracking-wider">Nominee photo</span></div>
            <h2 id="edit-nominee-photo-title" className="mt-2 break-words text-xl font-bold text-white">{nomination.fullName}</h2>
            <p className="mt-1 text-sm text-slate-400">This photo will update every award and approved candidate entry for this person.</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50" aria-label="Close photo editor"><X size={20} /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex min-h-44 items-center justify-center overflow-hidden rounded-md border border-slate-700 bg-slate-950">
            {imageUrl && !previewFailed ? (
              <img src={imageUrl} alt={`Preview for ${nomination.fullName}`} onError={() => setPreviewFailed(true)} className="max-h-72 w-full object-contain" />
            ) : (
              <div className="px-6 py-10 text-center text-slate-500"><Image className="mx-auto h-10 w-10" /><p className="mt-2 text-sm">{previewFailed ? "That URL could not be previewed." : "Paste an image URL to preview it."}</p></div>
            )}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-200">Image URL</span>
            <input type="url" value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setPreviewFailed(false); setError(""); }} placeholder="https://..." autoFocus className="min-h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none placeholder:text-slate-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20" />
          </label>
          {error && <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-800 p-5 sm:flex-row sm:justify-between">
          <button type="button" onClick={() => save("")} disabled={isSaving || !nomination.imageUrl} className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={17} /> Remove photo</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="min-h-11 flex-1 rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50 sm:flex-none">Cancel</button>
            <button type="button" onClick={() => save(imageUrl)} disabled={isSaving || !imageUrl.trim()} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none">{isSaving && <Loader2 className="animate-spin" size={17} />} Save photo</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditNomineeImageModal;
