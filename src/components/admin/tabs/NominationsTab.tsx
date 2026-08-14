import React, { useState } from "react";
import {
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Link as LinkIcon,
  Loader2,
  Search,
  Users,
  XCircle,
} from "lucide-react";
import type { NominationCategory } from "../../../types/admin";

interface NominationsTabProps {
  categoryGroups: NominationCategory[];
  total: number;
  submissionTotal: number;
  page: number;
  totalPages: number;
  isLoading: boolean;
  getCategoryTitle: (id: string) => string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onApproveNomination: (id: string) => Promise<void>;
  onRejectNomination: (id: string) => Promise<void>;
}

function mutationMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return fallback;
}

const NominationsTab: React.FC<NominationsTabProps> = ({
  categoryGroups,
  total,
  submissionTotal,
  page,
  totalPages,
  isLoading,
  getCategoryTitle,
  searchTerm,
  onSearchChange,
  onPageChange,
  onApproveNomination,
  onRejectNomination,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setOpenCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleCopyUrl = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      alert("Failed to copy the image URL.");
    }
  };

  const handleApprove = async (id: string) => {
    if (processingId) return;
    setProcessingId(id);
    try {
      await onApproveNomination(id);
    } catch (error) {
      alert(mutationMessage(error, "Failed to approve this nominee. Please try again."));
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (processingId) return;
    if (!confirm("Reject this nominee and every duplicate pending submission for this award?")) return;
    setProcessingId(id);
    try {
      await onRejectNomination(id);
    } catch (error) {
      alert(mutationMessage(error, "Failed to reject this nominee. Please try again."));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-amber-400 sm:text-3xl">Review Nominations</h2>
          <p className="mt-1 text-sm text-slate-400">
            {total.toLocaleString()} unique nominee{total === 1 ? "" : "s"} from {submissionTotal.toLocaleString()} submission{submissionTotal === 1 ? "" : "s"}. Repeated names are combined inside each of the 20 awards.
          </p>
        </div>
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Search nominees or award categories</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search nominee or award..."
            className="min-h-11 w-full rounded-md border border-slate-700 bg-slate-900 py-2 pl-10 pr-4 text-white outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
        </label>
      </div>

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
        </div>
      ) : categoryGroups.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 py-20 text-center">
          {searchTerm ? <Search className="mx-auto h-14 w-14 text-slate-600" /> : <Users className="mx-auto h-14 w-14 text-slate-600" />}
          <h3 className="mt-4 text-xl font-bold text-white">{searchTerm ? "No Matches" : "All Caught Up"}</h3>
          <p className="mt-2 text-slate-400">{searchTerm ? "Try another nominee or award name." : "There are no pending nominations to review."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categoryGroups.map((group) => {
            const category = group.id;
            const nominations = group.nominations;
            const isOpen = openCategories.has(category);
            const rawSubmissionCount = nominations.reduce((sum, item) => sum + (item.nominationCount || 1), 0);
            return (
              <section key={category} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-800/70 sm:px-5"
                  aria-expanded={isOpen}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold text-amber-200 sm:text-lg">{group.title || getCategoryTitle(category)}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">{nominations.length} unique · {rawSubmissionCount} total submission{rawSubmissionCount === 1 ? "" : "s"}</span>
                  </span>
                  {isOpen ? <ChevronUp className="shrink-0 text-amber-400" /> : <ChevronDown className="shrink-0 text-slate-400" />}
                </button>

                {isOpen && (
                  <ul className="space-y-3 border-t border-slate-800 p-3 sm:p-4">
                    {nominations.length === 0 ? (
                      <li className="rounded-md border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No nominations in this category yet.</li>
                    ) : nominations.map((nomination) => {
                      const isMutating = processingId === nomination.id;
                      const duplicateCount = nomination.nominationCount || 1;
                      const pendingCount = nomination.pendingCount || 0;
                      const reviewState = pendingCount > 0 ? "Pending" : (nomination.approvedCount || 0) > 0 ? "Approved" : "Rejected";
                      return (
                        <li key={nomination.id} className="flex flex-col gap-4 rounded-md border border-slate-700/60 bg-slate-800/70 p-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex min-w-0 items-center gap-4">
                            <img src={nomination.imageUrl || "/brand/nominee-placeholder-v2.png"} alt="" className="h-14 w-14 shrink-0 rounded-full border border-slate-600 object-cover" />
                            <div className="min-w-0">
                              <p className="break-words text-lg font-semibold text-white">{nomination.fullName}</p>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                {nomination.popularName && <span className="rounded bg-slate-950 px-2 py-1 text-slate-300">{nomination.popularName}</span>}
                                {duplicateCount > 1 && <span className="rounded bg-amber-500/15 px-2 py-1 font-bold text-amber-300">Nominated {duplicateCount} times</span>}
                                <span className={`rounded px-2 py-1 font-bold ${pendingCount > 0 ? "bg-amber-500/15 text-amber-300" : reviewState === "Approved" ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}>{reviewState}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
                            {nomination.imageUrl && (
                              <button type="button" onClick={() => handleCopyUrl(nomination.imageUrl!, nomination.id)} disabled={!!processingId} className="flex min-h-10 items-center gap-1.5 rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-600 disabled:opacity-50">
                                {copiedId === nomination.id ? <><Check size={14} /> Copied</> : <><LinkIcon size={14} /> Image URL</>}
                              </button>
                            )}
                            {pendingCount > 0 && <button type="button" onClick={() => handleApprove(nomination.id)} disabled={!!processingId} className="flex min-h-10 items-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-500 disabled:cursor-wait disabled:opacity-50">
                              {isMutating ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />} Approve
                            </button>}
                            {pendingCount > 0 && <button type="button" onClick={() => handleReject(nomination.id)} disabled={!!processingId} className="flex min-h-10 items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:cursor-wait disabled:opacity-50">
                              {isMutating ? <Loader2 className="animate-spin" size={14} /> : <XCircle size={14} />} Reject
                            </button>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex flex-col items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 sm:flex-row" aria-label="Nomination pages">
          <p className="text-sm text-slate-400">Award groups · Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1 || isLoading} aria-label="Previous nominations page" className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"><ChevronLeft size={18} /></button>
            <span className="min-w-24 text-center text-sm font-semibold text-white">{page} / {totalPages}</span>
            <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || isLoading} aria-label="Next nominations page" className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"><ChevronRight size={18} /></button>
          </div>
        </nav>
      )}
    </section>
  );
};

export default NominationsTab;
