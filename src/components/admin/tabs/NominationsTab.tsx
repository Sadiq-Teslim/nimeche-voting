import React, { useState, useMemo } from "react";
import { Users, Link as LinkIcon, Check, Search, CheckCircle, XCircle } from "lucide-react";
import type { Nomination } from "../../../types/admin";

interface NominationsTabProps {
  pendingNominations: Nomination[];
  getCategoryTitle: (id: string) => string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onApproveNomination: (id: string) => Promise<void>;
  onRejectNomination: (id: string) => Promise<void>;
}

const NominationsTab: React.FC<NominationsTabProps> = ({
  pendingNominations,
  getCategoryTitle,
  searchTerm,
  onSearchChange,
  onApproveNomination,
  onRejectNomination,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleCopyUrl = (url: string, id: string) => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
        alert("Failed to copy URL.");
      });
  };

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await onApproveNomination(id);
    } catch (err) {
      console.error(err);
      alert("Failed to approve nomination.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm("Are you sure you want to reject this nomination? It will be removed from pending but won't be added as a candidate.")) {
      return;
    }
    setProcessingId(id);
    try {
      await onRejectNomination(id);
    } catch (err) {
      console.error(err);
      alert("Failed to reject nomination.");
    } finally {
      setProcessingId(null);
    }
  };

  // Filter nominations based on the search term
  const filteredNominations = useMemo(() => {
    if (!searchTerm.trim()) {
      return pendingNominations;
    }
    const lowercasedSearchTerm = searchTerm.toLowerCase();
    return pendingNominations.filter(
      (nom) =>
        nom.fullName.toLowerCase().includes(lowercasedSearchTerm) ||
        (nom.popularName &&
          nom.popularName.toLowerCase().includes(lowercasedSearchTerm))
    );
  }, [pendingNominations, searchTerm]);

  // Group the filtered list of nominations
  const groupedNominations = useMemo(() => {
    return filteredNominations.reduce((acc, nom) => {
      (acc[nom.category] = acc[nom.category] || []).push(nom);
      return acc;
    }, {} as Record<string, Nomination[]>);
  }, [filteredNominations]);

  return (
    <section>
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-amber-400 self-start sm:self-center">
          Review Nominations
        </h2>
        <div className="relative w-full sm:w-auto sm:max-w-xs">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-5 h-5 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search for a nominee..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-500 text-white"
          />
        </div>
      </div>

      {pendingNominations.length === 0 && (
        <div className="text-center py-20 bg-slate-800/50 rounded-lg border border-slate-700">
          <Users className="mx-auto w-16 h-16 text-slate-500 mb-4" />
          <h3 className="text-xl font-bold text-white">All Caught Up!</h3>
          <p className="text-slate-400 mt-2">
            There are no pending nominations to review at this time.
          </p>
        </div>
      )}

      {pendingNominations.length > 0 && filteredNominations.length === 0 && (
        <div className="text-center py-20 bg-slate-800/50 rounded-lg border border-slate-700">
          <Search className="mx-auto w-16 h-16 text-slate-500 mb-4" />
          <h3 className="text-xl font-bold text-white">No Nominations Found</h3>
          <p className="text-slate-400 mt-2">
            Your search for "{searchTerm}" did not match any pending
            nominations.
          </p>
        </div>
      )}

      {filteredNominations.length > 0 && (
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
          <div className="space-y-6">
            {Object.entries(groupedNominations).map(([category, noms]) => (
              <div key={category} className="border-b border-slate-700/50 pb-6 last:border-0 last:pb-0">
                <h3 className="font-bold text-xl text-amber-200 mb-3">
                  {getCategoryTitle(category)} ({noms.length})
                </h3>
                <ul className="space-y-3">
                  {noms.map((nom) => {
                    const isMutating = processingId === nom.id;
                    return (
                      <li
                        key={nom.id}
                        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-700/60 p-4 rounded-lg border border-slate-700/30"
                      >
                        <div className="flex items-center gap-4">
                          <img
                            src={nom.imageUrl || "/placeholder.png"}
                            alt={nom.fullName}
                            className="w-14 h-14 rounded-full object-cover flex-shrink-0 border border-slate-600"
                          />
                          <div>
                            <span className="font-semibold text-white text-lg block">
                              {nom.fullName}
                            </span>
                            {nom.popularName && (
                              <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                                {nom.popularName}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                          {nom.imageUrl && (
                            <button
                              onClick={() => handleCopyUrl(nom.imageUrl!, nom.id)}
                              className={`flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md transition-all duration-200 ${
                                copiedId === nom.id
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-slate-600 hover:bg-slate-500 text-slate-300"
                              }`}
                              disabled={isMutating}
                            >
                              {copiedId === nom.id ? (
                                <>
                                  <Check size={14} /> Copied!
                                </>
                              ) : (
                                <>
                                  <LinkIcon size={14} /> Image URL
                                </>
                              )}
                            </button>
                          )}

                          <button
                            onClick={() => handleApprove(nom.id)}
                            disabled={isMutating}
                            className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-2 rounded-md transition-colors disabled:opacity-50"
                          >
                            <CheckCircle size={14} />
                            Approve
                          </button>

                          <button
                            onClick={() => handleReject(nom.id)}
                            disabled={isMutating}
                            className="flex items-center gap-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-2 rounded-md transition-colors disabled:opacity-50"
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default NominationsTab;
