// src/App.tsx
import { Suspense, lazy, useState, useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import LandingPage from "./pages/LandingPage";
import VotingPage, { type BallotSelections } from "./pages/VotingPage";
import VotingWelcomePage from "./pages/VotingWelcomePage";
import NominationPage from "./pages/NominationPage";
import { organization } from "./config/organization";

const AdminPage = lazy(() => import("./pages/AdminPage"));

// Define a type for our voter data
export interface VoterInfo {
  fullName: string;
  department: string;
  voterToken: string;
}

function App() {
  const [voter, setVoter] = useState<VoterInfo | null>(() => {
    try {
      const raw = sessionStorage.getItem("voter");
      if (!raw) return null;
      const saved = JSON.parse(raw) as VoterInfo;
      return saved.voterToken ? saved : null;
    } catch {
      return null;
    }
  });
  const [ballotSelections, setBallotSelections] = useState<BallotSelections>(() => {
    try {
      const raw = sessionStorage.getItem("ballotDraft");
      if (!raw) return {};
      const saved = JSON.parse(raw) as { voterToken?: string; selections?: BallotSelections };
      return voter?.voterToken === saved.voterToken && saved.selections ? saved.selections : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    document.documentElement.style.setProperty("--brand-primary", organization.colors.primary);
    document.documentElement.style.setProperty("--brand-secondary", organization.colors.secondary);
    document.documentElement.style.setProperty("--brand-accent", organization.colors.accent);
    document.documentElement.style.setProperty("--brand-background", organization.colors.background);
    document.documentElement.style.setProperty("--brand-display-font", organization.displayFontFamily);
    document.documentElement.style.fontFamily = organization.fontFamily;

    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.type = "image/png";
    favicon.href = organization.favicon;

    let touchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!touchIcon) {
      touchIcon = document.createElement("link");
      touchIcon.rel = "apple-touch-icon";
      document.head.appendChild(touchIcon);
    }
    touchIcon.href = organization.favicon;

    let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColor) {
      themeColor = document.createElement("meta");
      themeColor.name = "theme-color";
      document.head.appendChild(themeColor);
    }
    themeColor.content = organization.colors.primary;

    const brandStyle = document.createElement("style");
    brandStyle.textContent = `img[src="${organization.logo}"] { filter: ${organization.logoFilter}; }`;
    document.head.appendChild(brandStyle);

    if (organization.fontUrl) {
      const brandFont = new FontFace(
        "OrganizationBrand",
        `url(${organization.fontUrl})`,
      );
      brandFont
        .load()
        .then((font) => document.fonts.add(font))
        .catch(() => undefined);
    }
    return () => brandStyle.remove();
  }, []);

  useEffect(() => {
    if (voter) {
      sessionStorage.setItem("voter", JSON.stringify(voter));
    } else {
      sessionStorage.removeItem("voter");
    }
  }, [voter]);

  useEffect(() => {
    if (voter) {
      sessionStorage.setItem("ballotDraft", JSON.stringify({
        voterToken: voter.voterToken,
        selections: ballotSelections,
      }));
    } else {
      sessionStorage.removeItem("ballotDraft");
    }
  }, [ballotSelections, voter]);

  const handleVerifiedVoter = (nextVoter: VoterInfo) => {
    setBallotSelections({});
    setVoter(nextVoter);
  };

  const handleSignOut = () => {
    setBallotSelections({});
    setVoter(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
      <Switch>
        <Route path="/">
          <LandingPage setVoter={handleVerifiedVoter} />
        </Route>

        <Route path="/vote/:groupKey">
          {(params) => voter ? (
            <VotingPage
              voter={voter}
              groupKey={params.groupKey}
              selections={ballotSelections}
              setSelections={setBallotSelections}
            />
          ) : <Redirect to="/" />}
        </Route>

        <Route path="/vote">
          {voter ? (
            <VotingWelcomePage
              voter={voter}
              selections={ballotSelections}
              onSignOut={handleSignOut}
            />
          ) : <Redirect to="/" />}
        </Route>

        <Route path="/nominate" component={NominationPage} />
        <Route path="/admin">
          <Suspense
            fallback={
              <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 text-slate-300">
                Loading admin...
              </div>
            }
          >
            <AdminPage />
          </Suspense>
        </Route>

        <Route>404: Page Not Found!</Route>
      </Switch>
    </div>
  );
}

export default App;
