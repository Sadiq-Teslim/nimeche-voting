/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import ImageZoomModal from "../components/ImageZoomModal";
import { Redirect } from "wouter";
import { generateFingerprint } from "../utils/fingerprint";
import { retryWithBackoff } from "../utils/retry";
import type { VoterInfo } from "../App";
import { api, assetUrl } from "../api/client";
import { organization } from "../config/organization";
import {
  Check,
  Loader2,
  ArrowLeft,
  ShieldCheck,
  Search,
  ChevronRight,
  ChevronLeft,
  ShoppingCart,
} from "lucide-react";

// --- TypeScript Types ---
export interface Nominee {
  id: string;
  name: string;
  image: string | null;
  description?: string;
}
export interface Category {
  title: string;
  id: string;
  nominees: Nominee[];
}
type Selections = Record<string, string>;

// --- CSRF token cache (Fix #5: avoid double round-trip) ---
let cachedCsrfToken: string | null = null;
async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  const res = await retryWithBackoff(() =>
    api.get("/csrf-token")
  );
  cachedCsrfToken = res.data.csrfToken;
  return cachedCsrfToken!;
}

async function postVotesWithFreshCsrf(payload: unknown) {
  const csrfToken = await getCsrfToken();
  try {
    return await retryWithBackoff(() =>
      api.post("/submit-votes", payload, {
        headers: { "X-CSRF-Token": csrfToken },
      })
    );
  } catch (err: any) {
    if (err.response?.status !== 403) throw err;
    cachedCsrfToken = null;
    const freshToken = await getCsrfToken();
    return retryWithBackoff(() =>
      api.post("/submit-votes", payload, {
        headers: { "X-CSRF-Token": freshToken },
      })
    );
  }
}

// --- Success Modal Component ---
const SuccessModal = ({
  isOpen,
  onGoToHome,
  message,
}: {
  isOpen: boolean;
  onGoToHome: () => void;
  message: string;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 sm:p-8 max-w-md w-full text-center">
        <ShieldCheck className="w-16 h-16 text-green-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white">Votes Recorded!</h2>
        <p className="text-slate-300 mt-2 mb-8">{message}</p>
        <div className="space-y-3">
          <button
            onClick={onGoToHome}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors border border-slate-600"
          >
            Back to Categories Hub
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Nominee Carousel Component ---
const NomineeCarousel = ({
  category,
  selections,
  isCategoryVoted,
  onSelectNominee,
  onImageClick,
}: {
  category: Category;
  selections: Selections;
  isCategoryVoted: boolean;
  onSelectNominee: (categoryId: string, candidateId: string) => void;
  onImageClick: (nominee: Nominee) => void;
}) => {
  const scrollContainer = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = useCallback(() => {
    if (scrollContainer.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainer.current;
      setShowLeftArrow(scrollLeft > 1);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainer.current) {
      const scrollAmount = scrollContainer.current.clientWidth * 0.8;
      scrollContainer.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    const container = scrollContainer.current;
    if (!container) return;
    const observer = new ResizeObserver(() => handleScroll());
    observer.observe(container);
    const timer = setTimeout(() => handleScroll(), 100);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [category.nominees, handleScroll]);

  return (
    <div className="relative">
      <button
        onClick={() => scroll("left")}
        className="absolute -left-4 md:-left-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-600 flex items-center justify-center transition-opacity duration-300 disabled:opacity-0 disabled:cursor-default"
        disabled={!showLeftArrow}
      >
        <ChevronLeft className="text-white" />
      </button>
      <div
        ref={scrollContainer}
        onScroll={handleScroll}
        className="flex items-stretch gap-4 sm:gap-5 overflow-x-auto snap-x snap-mandatory px-2 py-2 pb-4 custom-scrollbar"
      >
        {category.nominees.map((nominee) => {
          const isSelected = selections[category.id] === nominee.id;
          const imageSrc = nominee.image
            ? nominee.image.startsWith("http")
              ? nominee.image
              : `/nominees/${nominee.image}`
            : `/placeholder.png`;
          return (
            <div
              key={nominee.id}
              onClick={
                isCategoryVoted
                  ? undefined
                  : () => onSelectNominee(category.id, nominee.id)
              }
              className={`snap-start w-36 sm:w-48 bg-slate-900/50 border rounded-xl p-3 text-center transition-all duration-300 relative group flex flex-col flex-shrink-0 ${
                isCategoryVoted
                  ? "cursor-not-allowed border-slate-700"
                  : "cursor-pointer border-slate-700 hover:border-amber-400/50 hover:-translate-y-1"
              } ${isSelected ? "border-amber-400 ring-2 ring-amber-400" : ""}`}
            >
              <div
                className={`relative w-24 h-24 mx-auto rounded-full overflow-hidden border-4 shadow-sm mb-3 transition-colors flex-shrink-0 ${
                  isSelected ? "border-amber-400" : "border-slate-600"
                }`}
              >
                <img
                  src={imageSrc}
                  alt={nominee.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
                {nominee.image && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onImageClick(nominee);
                    }}
                    className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-zoom-in"
                  />
                )}
              </div>
              <div className="flex-grow flex flex-col justify-center">
                <h3 className="font-bold text-white text-sm md:text-base group-hover:text-base whitespace-normal break-words min-h-[2.5rem]">
                  {nominee.name}
                </h3>
                <p className="text-slate-400 text-xs h-4 mb-3">
                  {nominee.description || ""}
                </p>
              </div>
              <div
                className={`w-full mt-auto py-2 px-3 rounded-lg font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-2 border ${
                  isSelected
                    ? "bg-gradient-to-r from-amber-500 to-amber-400 text-black border-amber-400"
                    : isCategoryVoted
                    ? "bg-slate-700 text-slate-400 border-slate-600"
                    : "bg-slate-800 text-slate-300 border-slate-600"
                }`}
              >
                {isCategoryVoted ? (
                  <><Check size={14} /> Voted</>
                ) : isSelected ? (
                  <><Check size={14} /> Selected</>
                ) : (
                  "Select"
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => scroll("right")}
        className="absolute -right-4 md:-right-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-600 flex items-center justify-center transition-opacity duration-300 disabled:opacity-0 disabled:cursor-default"
        disabled={!showRightArrow}
      >
        <ChevronRight className="text-white" />
      </button>
    </div>
  );
};

// --- Main Voting Page Component ---
const VotingPage: React.FC<{ voter: VoterInfo }> = ({ voter }) => {
  const { fullName, department } = voter;

  const [categories, setCategories] = useState<Category[]>([]);
  const [votedSubCategoryIds, setVotedSubCategoryIds] = useState<string[]>([]);
  const [selections, setSelections] = useState<Selections>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [zoomedNominee, setZoomedNominee] = useState<Nominee | null>(null);
  const fingerprintRef = useRef<string | null>(null);



  useEffect(() => {
    document.title = `${organization.electionTitle} | Voting`;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [structureRes, fp] = await Promise.all([
          retryWithBackoff(() => api.get("/ballot")),
          generateFingerprint(),
        ]);

        fingerprintRef.current = fp;
        const votedRes = await retryWithBackoff(() =>
          api.get("/voted-categories", { params: { fingerprint: fp } })
        );

        const jsonData = structureRes.data;
        let deptCats: Category[] = [];
        const userDepartment = jsonData.departments.find(
          (dept: any) => dept.id === department
        );
        if (userDepartment) {
          const deptName = userDepartment.title.replace("Departmental Awards - ", "");
          deptCats = userDepartment.subcategories.map((subCat: any) => ({
            ...subCat,
            title: `${deptName} - ${subCat.title}`,
          }));
        }
        setCategories([...jsonData.categories, ...deptCats]);

        // Use server-side cookie as source of truth for voted categories
        setVotedSubCategoryIds(votedRes.data.votedCategoryIds || []);
      } catch {
        setError("Could not load voting data. Please try refreshing.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [department]);



  const handleSelectNominee = (categoryId: string, candidateId: string) => {
    setSelections((prev) => ({ ...prev, [categoryId]: candidateId }));
  };

  // Submit votes — fingerprint + cookie, no email, immediate counting
  const handleSubmitVotes = async () => {
    if (Object.keys(selections).length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const fingerprint = fingerprintRef.current || (await generateFingerprint());
      fingerprintRef.current = fingerprint;
      const choices = Object.entries(selections).map(
        ([categoryId, candidateId]) => ({ categoryId, candidateId })
      );
      const payload = {
        fingerprint,
        department,
        choices,
      };

      const res = await postVotesWithFreshCsrf(payload);

      // Server returns the authoritative list of voted category IDs
      setVotedSubCategoryIds(res.data.votedCategoryIds || []);
      setSelections({});

      const recordedCount = res.data.recorded?.length || 0;
      const skippedCount = res.data.skipped?.length || 0;
      if (skippedCount > 0 && recordedCount === 0) {
        setModalMessage("You have already voted in all selected categories.");
      } else if (skippedCount > 0) {
        setModalMessage(`${recordedCount} vote(s) recorded. ${skippedCount} category(ies) were already voted in.`);
      } else {
        setModalMessage("Your votes have been recorded successfully. Thank you for voting!");
      }
      setIsSuccessModalOpen(true);
    } catch (err: any) {
      setSubmissionError(
        err.response?.data?.message || "An error occurred. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModalAndGoHome = () => {
    setIsSuccessModalOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenZoomModal = (nominee: Nominee) => setZoomedNominee(nominee);
  const handleCloseZoomModal = () => setZoomedNominee(null);

  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return categories;
    const lowercasedSearchTerm = searchTerm.toLowerCase();
    return categories.filter(
      (category) =>
        category.title.toLowerCase().includes(lowercasedSearchTerm) ||
        category.nominees.some((nominee) =>
          nominee.name.toLowerCase().includes(lowercasedSearchTerm)
        )
    );
  }, [categories, searchTerm]);

  if (!fullName) return <Redirect to="/" />;

  if (isLoading)
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-md">
        <div className="relative p-[2px] rounded-2xl bg-gradient-to-br from-amber-400/50 via-gray-800 to-amber-500/50">
          <div className="bg-slate-900 rounded-xl p-8 w-full relative shadow-2xl text-center">
            <img
              src={assetUrl(organization.logo)}
              alt="Loading"
              className="w-16 h-16 mx-auto mb-6 animate-spin"
              style={{ animationDuration: "3s" }}
            />
            <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">
              Preparing the Ballot
            </h2>
            <p className="text-slate-400 mt-2">Please wait a moment...</p>
          </div>
        </div>
      </div>
    );
  if (error)
    return (
      <div
        className="flex items-center justify-center p-4"
        style={{ backgroundImage: "url('/ornate_frame_bg.jpg')" }}
      >
        <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-center shadow-md">
          <h3 className="font-bold text-lg mb-2">An Error Occurred</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  const selectionCount = Object.keys(selections).length;
  return (
    <div
      className="min-h-screen w-full bg-black relative overflow-hidden bg-cover bg-center bg-fixed"
      style={{ backgroundColor: organization.colors.background }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md"></div>

      <SuccessModal
        isOpen={isSuccessModalOpen}
        onGoToHome={closeModalAndGoHome}
        message={modalMessage}
      />

      <ImageZoomModal nominee={zoomedNominee} onClose={handleCloseZoomModal} />

      <div className="relative z-10 max-w-7xl mx-auto p-4 sm:p-8 w-full pt-24 sm:pt-20 pb-64">
        <header className="fixed top-0 left-0 right-0 z-30 bg-black/30 backdrop-blur-md border-b border-slate-800">
          <div className="max-w-7xl mx-auto p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={assetUrl(organization.logo)} alt="Logo" className="w-8 h-8 object-contain" />
              <h1 className="text-xl font-bold text-white hidden sm:block">{organization.electionTitle} {organization.year}</h1>
            </div>
            <div className="relative w-full sm:w-auto sm:max-w-xs flex-grow sm:flex-grow-0">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search for a nominee..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-500 text-white"
              />
            </div>
          </div>
        </header>
        <main>
          <div className="text-center bg-slate-900/50 backdrop-blur-md rounded-xl shadow-lg p-6 border border-slate-700 mt-6 mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">
              {organization.electionTitle} Ballot
            </h1>
            <p className="text-slate-400 mt-2 max-w-2xl mx-auto">
              Welcome, <span className="font-semibold text-white">{fullName}</span>. Select one nominee for each available award below.
            </p>
          </div>
          <div className="space-y-12">
                  {filteredCategories.map((category) => {
                    const isCategoryVoted = votedSubCategoryIds.includes(category.id);
                    return (
                      <section
                        key={category.id}
                        className={`transition-opacity ${isCategoryVoted ? "opacity-60" : ""}`}
                      >
                        <div className="text-center mb-6 relative">
                          <h2 className="text-2xl font-bold text-white">{category.title}</h2>
                          {isCategoryVoted && (
                            <p className="text-sm font-semibold text-amber-400 mt-1">
                              You have already voted in this award
                            </p>
                          )}
                        </div>
                        <NomineeCarousel
                          category={category}
                          selections={selections}
                          isCategoryVoted={isCategoryVoted}
                          onSelectNominee={handleSelectNominee}
                          onImageClick={handleOpenZoomModal}
                        />
                      </section>
                    );
                  })}
                  {filteredCategories.length === 0 && searchTerm && (
                    <div className="text-center py-16">
                      <p className="text-slate-400 text-lg">No results found for "{searchTerm}".</p>
                    </div>
                  )}
                </div>
              </main>
            </>
          )
        )}
      </div>
      <footer className="fixed bottom-0 left-0 right-0 z-20 bg-black/50 backdrop-blur-md border-t border-white/10 p-4 transition-transform duration-300">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="text-left">
            <h3 className="font-bold text-white">Your Ballot</h3>
            <p className="text-sm text-amber-300">{selectionCount} vote(s) selected.</p>
            {submissionError && (
              <p className="text-xs text-red-400 mt-1">{submissionError}</p>
            )}
          </div>
          <button
            onClick={handleSubmitVotes}
            disabled={selectionCount === 0 || isSubmitting}
            className="group w-auto bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-500 transition-all duration-300 text-black font-bold text-base py-3 px-6 sm:px-10 rounded-lg shadow-lg shadow-amber-500/10 disabled:from-slate-600 disabled:to-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ShoppingCart className="w-5 h-5" />
            )}
            <span>
              {isSubmitting ? "Submitting..." : `Submit ${selectionCount} Vote(s)`}
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
};

export default VotingPage;
