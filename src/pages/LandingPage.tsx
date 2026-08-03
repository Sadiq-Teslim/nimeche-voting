/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import ValidationModal from "../components/ValidationModal";
import { Users, ArrowRight, Crown, Star, XCircle } from "lucide-react";
import type { VoterInfo } from "../App";
import { api, assetUrl } from "../api/client";
import { organization } from "../config/organization";

interface LandingPageProps {
  setVoter: (voter: VoterInfo) => void;
}

// ── NIMechE colour tokens ─────────────────────────────────────────────────────
const brand = {
  bg: "#0A0D0A",
  orange: "#E8650A",
  orangeHover: "#CF5A09",
  green: "#2E7D32",
  gold: "#F5A623",
  textPrimary: "#F2EDE8",
  textSecondary: "#BDD0BE",
  textMuted: "#7A9A7C",
  border: "rgba(232,101,10,0.25)",
  cardBg: "rgba(13,22,10,0.7)",
};

const LandingPage: React.FC<LandingPageProps> = ({ setVoter }) => {
  const isNominationPortal = organization.portalMode === "nominations";
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [, setLocation] = useLocation();
  const [electionStatus, setElectionStatus] = useState<"open" | "closed" | "loading">("loading");

  useEffect(() => {
    document.title = `${organization.electionTitle} ${organization.year} | Home`;
    if (isNominationPortal) return;
    api
      .get("/election-status")
      .then((res) => setElectionStatus(res.data.status))
      .catch(() => setElectionStatus("closed"));
  }, []);

  const handleValidationSuccess = (voterInfo: VoterInfo) => {
    setVoter(voterInfo);
    setLocation("/vote");
  };

  return (
    <div
      className="relative min-h-screen w-full overflow-x-hidden text-white flex flex-col"
      style={{ backgroundColor: brand.bg, fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* Background Image Layer */}
      {organization.nominationBackground && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-cover bg-center bg-no-repeat opacity-30"
            style={{ backgroundImage: `url("${assetUrl(organization.nominationBackground)}")` }}
          />
          <div aria-hidden="true" className="fixed inset-0 bg-gradient-to-b from-[#0A0D0A]/70 via-[#0A0D0A]/85 to-[#0A0D0A]" />
        </>
      )}

      {/* Ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(46,125,50,0.22) 0%, transparent 70%), " +
            "radial-gradient(ellipse 50% 40% at 80% 90%, rgba(232,101,10,0.12) 0%, transparent 60%)",
        }}
      />



      {/* Hero — fully centred */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12 text-center sm:px-8">

        {/* Logo */}
        <img
          src={assetUrl(organization.logo)}
          alt={organization.name}
          className="mb-8 h-28 w-28 object-contain drop-shadow-2xl sm:h-36 sm:w-36"
          style={{ filter: "drop-shadow(0 0 24px rgba(232,101,10,0.35))" }}
        />

        {/* Eyebrow */}
        <p
          className="mb-4 text-xs font-bold uppercase tracking-[0.22em] sm:text-sm"
          style={{ color: brand.gold }}
        >
          {isNominationPortal ? "Official Nomination Portal" : "Official Voting Portal"}
        </p>

        {/* Title */}
        <h1
          className="text-4xl font-bold leading-tight sm:text-6xl lg:text-7xl"
          style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            color: brand.textPrimary,
          }}
        >
          {organization.electionTitle}
        </h1>
        <p
          className="mt-2 text-xl font-semibold sm:text-2xl"
          style={{ color: brand.orange }}
        >
          {organization.year}
        </p>

        {/* Tagline */}
        <p
          className="mx-auto mt-5 max-w-xl text-base leading-7 sm:text-lg"
          style={{ color: brand.textSecondary }}
        >
          {isNominationPortal
            ? "Recognise the engineers and changemakers shaping NIMECHE UNILAG SF. Submit your nominations below."
            : "Make your voice count. Cast your vote across every award category."}
        </p>

        {/* CTA */}
        <div className="mt-8">
          {isNominationPortal ? (
            <Link
              href="/nominate"
              className="group inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl px-8 py-3.5 font-bold text-white shadow-xl transition-all"
              style={{ backgroundColor: brand.orange }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = brand.orangeHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = brand.orange)}
            >
              Submit a Nomination
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          ) : (
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={electionStatus !== "open"}
              className="group inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl px-8 py-3.5 font-bold text-white shadow-xl transition-all disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: brand.orange }}
            >
              {electionStatus === "closed" && <XCircle className="h-5 w-5" />}
              <span>
                {electionStatus === "loading" && "Checking Status..."}
                {electionStatus === "open" && "Proceed to Vote"}
                {electionStatus === "closed" && "Voting is Closed"}
              </span>
              {electionStatus === "open" && (
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              )}
            </button>
          )}
        </div>

        {/* Stat strip */}
        <div
          className="mx-auto mt-14 grid w-full max-w-2xl grid-cols-1 overflow-hidden rounded-2xl border sm:grid-cols-3"
          style={{ borderColor: brand.border, backgroundColor: brand.cardBg, backdropFilter: "blur(12px)" }}
        >
          <div
            className="flex items-center gap-4 px-6 py-5 sm:border-r"
            style={{ borderColor: brand.border }}
          >
            <Users className="h-6 w-6 shrink-0" style={{ color: brand.gold }} />
            <div className="text-left">
              <h2 className="text-sm font-semibold" style={{ color: brand.textPrimary }}>
                {isNominationPortal ? "Open Nominations" : "Eligible Members"}
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: brand.textMuted }}>
                {isNominationPortal
                  ? "Name, award & optional photo"
                  : `Verified NIMECHE UNILAG SF members only`}
              </p>
            </div>
          </div>

          <div
            className="flex items-center gap-4 border-t px-6 py-5 sm:border-t-0 sm:border-r"
            style={{ borderColor: brand.border }}
          >
            <Crown className="h-6 w-6 shrink-0" style={{ color: brand.gold }} />
            <div className="text-left">
              <h2 className="text-sm font-semibold" style={{ color: brand.textPrimary }}>
                20 Award Categories
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: brand.textMuted }}>
                Level-specific & department awards
              </p>
            </div>
          </div>

          <div
            className="flex items-center gap-4 border-t px-6 py-5 sm:border-t-0"
            style={{ borderColor: brand.border }}
          >
            <Star className="h-6 w-6 shrink-0" style={{ color: brand.gold }} />
            <div className="text-left">
              <h2 className="text-sm font-semibold" style={{ color: brand.textPrimary }}>
                Committee Reviewed
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: brand.textMuted }}>
                Every submission is carefully vetted
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        className="relative z-10 border-t py-4 text-center text-xs"
        style={{ borderColor: brand.border, color: brand.textMuted }}
      >
        NIMECHE UNILAG SF · {organization.year} · Nigerian Institution of Mechanical Engineers
      </footer>

      <ValidationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleValidationSuccess}
      />
    </div>
  );
};

export default LandingPage;
