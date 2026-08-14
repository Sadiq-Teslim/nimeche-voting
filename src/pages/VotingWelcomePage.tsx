import { useEffect, useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  GraduationCap,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { api, assetUrl } from "../api/client";
import { organization } from "../config/organization";
import type { VoterInfo } from "../App";
import type { BallotSelections, Category } from "./VotingPage";
import { retryWithBackoff } from "../utils/retry";

interface VotingGroup {
  id: string;
  label: string;
  categories: Category[];
}

const brand = {
  background: "#0A0D0A",
  panel: "rgba(13, 22, 10, 0.88)",
  orange: "#E8650A",
  green: "#2E7D32",
  gold: "#F5A623",
  text: "#F2EDE8",
  secondary: "#BDD0BE",
  muted: "#7A9A7C",
  border: "rgba(232, 101, 10, 0.3)",
};

const groupDetails: Record<string, { description: string; icon: typeof GraduationCap }> = {
  level: {
    description: "Recognise outstanding students across every academic level.",
    icon: GraduationCap,
  },
  department: {
    description: "Choose the people shaping NIMEChE through impact, talent and service.",
    icon: Building2,
  },
};

const VotingWelcomePage: React.FC<{ voter: VoterInfo; selections: BallotSelections; onSignOut: () => void }> = ({ voter, selections, onSignOut }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [votedCategoryIds, setVotedCategoryIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${organization.electionTitle} | Choose a Ballot`;
    const fetchOverview = async () => {
      try {
        const ballotResponse = await retryWithBackoff(() => api.get("/ballot"));
        const votedResponse = await retryWithBackoff(() =>
          api.get("/voted-categories", { headers: { "X-Voter-Token": voter.voterToken } }),
        );
        const departmentCategories = (ballotResponse.data.departments || []).flatMap(
          (department: { subcategories?: Category[] }) => department.subcategories || [],
        );
        setCategories([...(ballotResponse.data.categories || []), ...departmentCategories]);
        setVotedCategoryIds(votedResponse.data.votedCategoryIds || []);
      } catch {
        setError("Could not load the voting overview. Please refresh and try again.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchOverview();
  }, [voter.voterToken]);

  const groups = useMemo<VotingGroup[]>(
    () =>
      Object.entries(organization.categoryGroups).map(([id, label]) => ({
        id,
        label,
        categories: categories.filter((category) => category.groupKey === id),
      })),
    [categories],
  );

  if (!voter.fullName || !voter.voterToken) return <Redirect to="/" />;
  const draftSelectionCount = Object.keys(selections).length;

  const backgroundImage = organization.nominationBackground
    ? `url("${assetUrl(organization.nominationBackground)}")`
    : undefined;

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden" style={{ backgroundColor: brand.background }}>
      <div aria-hidden="true" className="fixed inset-0 bg-cover bg-center bg-no-repeat opacity-25" style={{ backgroundImage }} />
      <div aria-hidden="true" className="fixed inset-0 bg-[rgba(10,13,10,0.86)]" />

      <header className="relative z-10 border-b" style={{ borderColor: brand.border }}>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src={assetUrl(organization.logo)} alt="" className="h-11 w-11 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold" style={{ color: brand.text }}>{organization.shortName}</p>
              <p className="text-xs" style={{ color: brand.muted }}>Official 2026 voting portal</p>
            </div>
          </div>
          <button type="button" onClick={onSignOut} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-bold transition-colors hover:bg-white/5 sm:text-sm" style={{ borderColor: brand.border, color: brand.secondary }}>
            <LogOut size={16} /> <span className="hidden sm:inline">Verify another student</span><span className="sm:hidden">Switch voter</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-78px)] w-full max-w-6xl flex-col justify-center px-4 py-10 sm:px-8 sm:py-16">
        <section className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-bold uppercase tracking-[0.14em]" style={{ borderColor: brand.border, color: brand.gold }}>
            <ShieldCheck size={16} /> Verified Ballot
          </div>
          <h1 className="mt-5 text-4xl font-bold sm:text-6xl" style={{ color: brand.text }}>Where would you like to vote?</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 sm:text-lg" style={{ color: brand.secondary }}>
            Welcome, <strong style={{ color: brand.text }}>{voter.fullName}</strong>. Choose an award collection below. Your selections are carried between both collections until you submit the full ballot.
          </p>
          {draftSelectionCount > 0 && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-bold" style={{ borderColor: brand.border, backgroundColor: brand.panel, color: brand.gold }}>
              <CheckCircle2 size={18} /> {draftSelectionCount} selection{draftSelectionCount === 1 ? "" : "s"} currently carried
            </div>
          )}
        </section>

        {isLoading ? (
          <div className="mt-10 flex min-h-64 items-center justify-center rounded-lg border" style={{ borderColor: brand.border, backgroundColor: brand.panel }}>
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin" style={{ color: brand.orange }} />
              <p className="mt-3 text-sm" style={{ color: brand.secondary }}>Preparing your voting paths...</p>
            </div>
          </div>
        ) : error ? (
          <div className="mt-10 rounded-lg border border-red-400/30 bg-red-950/40 p-6 text-red-200">{error}</div>
        ) : (
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {groups.map((group, index) => {
              const detail = groupDetails[group.id] || groupDetails.department;
              const Icon = detail.icon;
              const available = group.categories.filter((category) => category.nominees.length > 0).length;
              const completed = group.categories.filter((category) => votedCategoryIds.includes(category.id)).length;
              const drafted = group.categories.filter((category) => selections[category.id]).length;
              const isComplete = available > 0 && completed >= available;

              return (
                <Link
                  key={group.id}
                  href={`/vote/${group.id}`}
                  className="group relative flex min-h-72 flex-col overflow-hidden rounded-lg border p-6 transition-transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[#E8650A] sm:p-8"
                  style={{ borderColor: isComplete ? "rgba(46, 125, 50, 0.8)" : brand.border, backgroundColor: brand.panel }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-14 w-14 items-center justify-center rounded-md border" style={{ borderColor: brand.border, color: index === 0 ? brand.orange : brand.gold, backgroundColor: "rgba(0,0,0,0.25)" }}>
                      <Icon size={28} />
                    </span>
                    {isComplete ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#2E7D32]/20 px-3 py-1.5 text-xs font-bold text-green-300">
                        <CheckCircle2 size={15} /> Complete
                      </span>
                    ) : drafted > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#E8650A]/15 px-3 py-1.5 text-xs font-bold" style={{ color: brand.gold }}>
                        {drafted} carried
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-8 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: brand.orange }}>{group.categories.length} awards</p>
                  <h2 className="mt-2 text-2xl font-bold sm:text-3xl" style={{ color: brand.text }}>{group.label}</h2>
                  <p className="mt-3 flex-1 leading-6" style={{ color: brand.secondary }}>{detail.description}</p>
                  <div className="mt-7 flex items-center justify-between border-t pt-5" style={{ borderColor: brand.border }}>
                    <span className="text-sm" style={{ color: brand.muted }}>{completed} completed · {drafted} selected</span>
                    <span className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: brand.gold }}>
                      {isComplete ? "Review ballot" : drafted > 0 ? "Continue ballot" : "Enter ballot"}
                      <ArrowRight className="transition-transform group-hover:translate-x-1" size={18} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default VotingWelcomePage;
