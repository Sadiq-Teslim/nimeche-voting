import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3,
  Download,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  X,
} from "lucide-react";

// Import your new components
import AdminLogin from "../components/admin/AdminLogin";
import ConfirmationModal from "../components/admin/modals/ConfirmationModal";
import ResetElectionModal from "../components/admin/modals/ResetElectionModal";
import NominationsTab from "../components/admin/tabs/NominationsTab";
import SettingsTab from "../components/admin/tabs/SettingsTab";
import SetupTab from "../components/admin/tabs/SetupTab";

const ResultsTab = lazy(() => import("../components/admin/tabs/ResultsTab"));
const TabularResultsTab = lazy(() => import("../components/admin/tabs/TabularResultsTab"));

// Import types from the central types file
import type {
  CategoryResult,
  CategoryInfo,
  DepartmentInfo,
  NominationCategory,
  ModalState,
  ElectionSetup,
  PositionSetup,
  CandidateSetup,
} from "../types/admin";
import { api, assetUrl } from "../api/client";
import { organization } from "../config/organization";

const NOMINATION_CATEGORIES_PER_PAGE = 5;

const AdminPage = () => {
  // --- STATE MANAGEMENT ---
  const [adminToken, setAdminToken] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [results, setResults] = useState<CategoryResult[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [nominationCategoryGroups, setNominationCategoryGroups] = useState<NominationCategory[]>([]);
  const [nominationTotal, setNominationTotal] = useState(0);
  const [nominationSubmissionTotal, setNominationSubmissionTotal] = useState(0);
  const [nominationPage, setNominationPage] = useState(1);
  const [nominationTotalPages, setNominationTotalPages] = useState(1);
  const [nominationSearch, setNominationSearch] = useState("");
  const [isLoadingNominations, setIsLoadingNominations] = useState(false);
  const [electionStatus, setElectionStatus] = useState<"open" | "closed">(
    "closed"
  );
  const [portalMode, setPortalMode] = useState<"nominations" | "voting">("nominations");
  const [electionSetup, setElectionSetup] = useState<ElectionSetup | null>(null);
  const [setupPositions, setSetupPositions] = useState<PositionSetup[]>([]);
  const [setupCandidates, setSetupCandidates] = useState<CandidateSetup[]>([]);
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("results");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    confirmText: "",
  });
  const [isProcessingModal, setIsProcessingModal] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Define group titles for the PDF
  const groupTitles: Record<string, string> = organization.categoryGroups;

  // --- Check for persisted JWT session on mount ---
  useEffect(() => {
    const storedToken = sessionStorage.getItem("adminToken");
    if (storedToken) {
      setAdminToken(storedToken);
      setIsAuthenticated(true);
      fetchAllAdminData(storedToken);
    }
    setIsCheckingAuth(false);
    // fetchAllAdminData is declared below and is stable enough for this mount-only auth check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- LOGIC & DATA HANDLING ---

  const authHeaders = useCallback((token: string) => ({
    headers: { Authorization: `Bearer ${token}` }
  }), []);

  const fetchNominationPage = useCallback(async (
    token: string,
    page = 1,
    search = "",
    showLoading = true,
  ) => {
    if (showLoading) setIsLoadingNominations(true);
    try {
      const response = await api.post(
        "/pending-nominations",
        { page, limit: NOMINATION_CATEGORIES_PER_PAGE, search },
        authHeaders(token),
      );
      const totalPages = Math.max(1, response.data.totalPages || 1);
      setNominationCategoryGroups(response.data.categories || []);
      setNominationTotal(response.data.total || 0);
      setNominationSubmissionTotal(response.data.submissionTotal || 0);
      setNominationTotalPages(totalPages);
      setNominationPage(Math.min(page, totalPages));
      return response.data;
    } finally {
      if (showLoading) setIsLoadingNominations(false);
    }
  }, [authHeaders]);

  const handleResetElection = async () => {
    const response = await api.post("/reset-election", {}, authHeaders(adminToken));
    handleRefresh();
    return response.data;
  };

  const getCategoryTitle = useCallback(
    (categoryId: string) => {
      const topLevelCategory = categories.find((c) => c.id === categoryId);
      if (topLevelCategory) return topLevelCategory.title;

      for (const department of departments) {
        const subCategory = department.subcategories.find(
          (sc) => sc.id === categoryId
        );
        if (subCategory) {
          return `${department.title.replace("Departmental Awards - ", "")}: ${
            subCategory.title
          }`;
        }
      }
      return categoryId;
    },
    [categories, departments]
  );

  const fetchAllAdminData = useCallback(
    async (token: string) => {
      setIsInitialLoading(true);
      const headers = { headers: { Authorization: `Bearer ${token}` } };
      try {
        const [resultsRes, categoriesRes, statusRes, setupRes] =
          await Promise.all([
            api.post("/results", {}, headers),
            api.get("/ballot"),
            api.get("/election-status"),
            api.get("/setup", headers),
            fetchNominationPage(token, 1, "", false),
          ]);
        setResults(resultsRes.data);
        setCategories(categoriesRes.data.categories);
        setDepartments(categoriesRes.data.departments);
        setElectionStatus(statusRes.data.status);
        setPortalMode(statusRes.data.portalMode || "nominations");
        setElectionSetup(setupRes.data.election);
        setSetupPositions(setupRes.data.positions || []);
        setSetupCandidates(setupRes.data.candidates || []);
        return true;
      } catch {
        setError("Session expired or invalid. Please log in again.");
        setIsAuthenticated(false);
        sessionStorage.removeItem("adminToken");
        return false;
      } finally {
        setIsInitialLoading(false);
      }
    },
    [fetchNominationPage]
  );

  const handleLogin = async (submittedPassword: string) => {
    setIsLoggingIn(true);
    setError("");
    try {
      const loginRes = await api.post("/admin-login", { password: submittedPassword });
      const token = loginRes.data.token;
      setAdminToken(token);
      sessionStorage.setItem("adminToken", token);
      const success = await fetchAllAdminData(token);
      if (success) {
        setIsAuthenticated(true);
      }
    } catch {
      setError("Access Denied. Invalid Password.");
    }
    setIsLoggingIn(false);
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    const headers = { headers: { Authorization: `Bearer ${adminToken}` } };
    try {
      const [resultsRes, categoriesRes, statusRes, setupRes] = await Promise.all([
        api.post("/results", {}, headers),
        api.get("/ballot"),
        api.get("/election-status"),
        api.get("/setup", headers),
        fetchNominationPage(adminToken, nominationPage, nominationSearch, false),
      ]);
      setResults(resultsRes.data);
      setCategories(categoriesRes.data.categories);
      setDepartments(categoriesRes.data.departments);
      setElectionStatus(statusRes.data.status);
      setPortalMode(statusRes.data.portalMode || "nominations");
      setElectionSetup(setupRes.data.election);
      setSetupPositions(setupRes.data.positions || []);
      setSetupCandidates(setupRes.data.candidates || []);
    } catch (error) {
      console.error("Refresh failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [adminToken, fetchNominationPage, nominationPage, nominationSearch]);

  useEffect(() => {
    if (!isAuthenticated || !adminToken) return;
    const timeout = window.setTimeout(() => {
      fetchNominationPage(adminToken, nominationPage, nominationSearch).catch((fetchError) => {
        console.error("Failed to load nominations:", fetchError);
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [adminToken, fetchNominationPage, isAuthenticated, nominationPage, nominationSearch]);

  const saveElectionSetup = async (payload: Pick<ElectionSetup, "title" | "year" | "status">) => {
    await api.put("/election", payload, authHeaders(adminToken));
    await handleRefresh();
  };

  const saveDepartment = async (payload: { id: string; title: string; sortOrder?: number }) => {
    await api.post("/departments", payload, authHeaders(adminToken));
    await handleRefresh();
  };

  const deleteDepartment = async (id: string) => {
    await api.delete(`/departments/${id}`, authHeaders(adminToken));
    await handleRefresh();
  };

  const savePosition = async (payload: Omit<PositionSetup, "sortOrder"> & { sortOrder?: number }) => {
    await api.post("/positions", payload, authHeaders(adminToken));
    await handleRefresh();
  };

  const deletePosition = async (id: string) => {
    await api.delete(`/positions/${id}`, authHeaders(adminToken));
    await handleRefresh();
  };

  const saveCandidate = async (payload: Omit<CandidateSetup, "id">) => {
    await api.post("/candidates", payload, authHeaders(adminToken));
    await handleRefresh();
  };

  const deleteCandidate = async (id: string) => {
    await api.delete(`/candidates/${id}`, authHeaders(adminToken));
    await handleRefresh();
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(handleRefresh, 300000); // Auto-refresh every 3 minutes
    return () => clearInterval(interval);
  }, [isAuthenticated, handleRefresh]);

  const handleDownloadNominationsPdf = async () => {
    setIsDownloading(true);
    try {
      const response = await api.post("/export-nominations", {}, authHeaders(adminToken));
      const nominations = response.data.nominations || [];
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 16;
      let y = margin;
      let pageNumber = 1;
      let logoData: string | null = null;
      const categoryUniqueCounts = nominations.reduce((counts: Record<string, number>, nomination: { category: string }) => {
        counts[nomination.category] = (counts[nomination.category] || 0) + 1;
        return counts;
      }, {});

      try {
        const logoResponse = await fetch(assetUrl(organization.logo));
        const logoBlob = await logoResponse.blob();
        logoData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(logoBlob);
        });
      } catch {
        logoData = null;
      }

      const addHeader = () => {
        pdf.setFillColor(10, 13, 10);
        pdf.rect(0, 0, pageWidth, 37, "F");
        pdf.setFillColor(232, 101, 10);
        pdf.rect(0, 37, pageWidth, 1.5, "F");
        if (logoData) {
          try {
            pdf.addImage(logoData, "PNG", margin, 7, 22, 22, undefined, "FAST");
          } catch {
            // The text header remains complete if a browser cannot decode the logo.
          }
        }
        const titleX = logoData ? margin + 28 : margin;
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(17);
        pdf.text(`${organization.shortName} Nomination Report`, titleX, 14);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(190, 208, 190);
        pdf.text(`Official Awards Nomination Register | ${organization.year}`, titleX, 21);
        pdf.text(
          `${response.data.total || nominations.length} unique nominees | ${(response.data.submissionTotal || 0).toLocaleString()} total submissions`,
          titleX,
          27,
        );
        pdf.setTextColor(30, 41, 59);
        y = 47;
      };

      const addFooter = () => {
        pdf.setDrawColor(226, 232, 240);
        pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Generated ${new Date().toLocaleString()}`, margin, pageHeight - 7);
        pdf.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 7, { align: "right" });
      };

      const ensureSpace = (height = 14) => {
        if (y + height <= pageHeight - 18) return;
        addFooter();
        pdf.addPage();
        pageNumber += 1;
        addHeader();
      };

      addHeader();
      if (nominations.length === 0) {
        pdf.setFontSize(11);
        pdf.text("No nominations have been submitted.", margin, y);
      } else {
        let currentCategory = "";
        for (const nomination of nominations) {
          const categoryTitle = nomination.categoryTitle || getCategoryTitle(nomination.category);
          if (categoryTitle !== currentCategory) {
            ensureSpace(20);
            if (currentCategory) y += 3;
            currentCategory = categoryTitle;
            pdf.setFillColor(255, 247, 237);
            pdf.roundedRect(margin, y - 5, pageWidth - margin * 2, 11, 1.5, 1.5, "F");
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(11);
            pdf.setTextColor(194, 65, 12);
            const categoryHeading = `${categoryTitle} | ${categoryUniqueCounts[nomination.category] || 0} unique nominee${categoryUniqueCounts[nomination.category] === 1 ? "" : "s"}`;
            const titleLines = pdf.splitTextToSize(categoryHeading, pageWidth - margin * 2 - 8);
            pdf.text(titleLines, margin, y);
            y += Math.max(10, titleLines.length * 5 + 5);
          }

          const approvedCount = Number(nomination.approvedCount || 0);
          const pendingCount = Number(nomination.pendingCount || 0);
          const rejectedCount = Number(nomination.rejectedCount || 0);
          const reviewState = approvedCount > 0
            ? "APPROVED"
            : pendingCount > 0
              ? "PENDING"
              : rejectedCount > 0
                ? "REJECTED"
                : "UNREVIEWED";
          const detail = [
            nomination.fullName,
            nomination.popularName ? `(${nomination.popularName})` : "",
            `| Nominated ${nomination.nominationCount || 1} time${Number(nomination.nominationCount || 1) === 1 ? "" : "s"}`,
            `| ${reviewState}`,
          ].filter(Boolean).join("  ");
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9);
          pdf.setTextColor(51, 65, 85);
          const lines = pdf.splitTextToSize(detail, pageWidth - margin * 2 - 4);
          ensureSpace(lines.length * 5 + 4);
          pdf.text("-", margin, y);
          pdf.text(lines, margin + 4, y);
          y += lines.length * 5 + 3;
        }
      }
      addFooter();
      pdf.save(`${organization.shortName.toLowerCase()}-unique-nominations-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (downloadError) {
      console.error("Error exporting nominations:", downloadError);
      alert("Could not export the nominations PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (activeTab === "nominations") {
      await handleDownloadNominationsPdf();
      return;
    }
    const reportElement = document.getElementById("pdf-report");
    if (!reportElement) {
      alert("Could not find the report element to generate PDF.");
      return;
    }

    setIsDownloading(true);

    // --- FIX STARTS HERE ---

    // 1. Store the original inline styles of the report element
    const originalStyles = {
      position: reportElement.style.position,
      left: reportElement.style.left,
      top: reportElement.style.top,
      zIndex: reportElement.style.zIndex,
    };

    // 2. Temporarily move the element into the viewport so html2canvas can see it.
    //    We make it invisible to the user with a negative z-index.
    reportElement.style.position = "absolute";
    reportElement.style.left = "0";
    reportElement.style.top = "0";
    reportElement.style.zIndex = "-1";

    // --- END OF FIX PREPARATION ---

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      // Small delay to ensure any images or complex styles have rendered
      await new Promise(resolve => setTimeout(resolve, 50)); 
        
      const canvas = await html2canvas(reportElement, {
        scale: 2, // Higher scale for better quality
        useCORS: true,
        logging: false, // Optional: disable logging in console
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      const ratio = canvasWidth / pdfWidth;
      const imgHeight = canvasHeight / ratio;
      const pdfHeight = pdf.internal.pageSize.getHeight();

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = position - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(
        `${organization.shortName.toLowerCase()}-results-${new Date().toISOString().slice(0, 10)}.pdf`
      );
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("An error occurred while generating the PDF.");
    } finally {
      // --- FIX STARTS HERE ---

      // 3. Restore the original styles to hide the element again.
      //    This happens whether the PDF generation succeeded or failed.
      reportElement.style.position = originalStyles.position;
      reportElement.style.left = originalStyles.left;
      reportElement.style.top = originalStyles.top;
      reportElement.style.zIndex = originalStyles.zIndex;

      // --- END OF FIX ---

      setIsDownloading(false);
    }
  };

  const groupedAndFilteredResults = useMemo(() => {
    const filtered = results.filter((result) =>
      getCategoryTitle(result.category)
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
    );
    const grouped = Object.fromEntries(
      Object.keys(organization.categoryGroups).map((groupKey) => [groupKey, [] as CategoryResult[]]),
    ) as Record<string, CategoryResult[]>;
    for (const result of filtered) {
      const positionGroup = setupPositions.find((position) => position.id === result.category)?.groupKey;
      if (positionGroup && grouped[positionGroup]) grouped[positionGroup].push(result);
      else {
        const fallbackGroup = Object.keys(grouped)[0];
        if (fallbackGroup) grouped[fallbackGroup].push(result);
      }
    }
    return grouped;
  }, [results, searchTerm, getCategoryTitle, setupPositions]);

  const stats = useMemo(() => {
    const totalVotes = results.reduce(
      (sum, category) =>
        sum +
        category.nominees.reduce(
          (catSum, nominee) => catSum + nominee.votes,
          0
        ),
      0
    );
    const totalCategories =
      categories.length +
      departments.reduce((sum, dept) => sum + dept.subcategories.length, 0);
    const totalNominees =
      categories.reduce((sum, cat) => sum + cat.nominees.length, 0) +
      departments.reduce(
        (sum, dept) =>
          sum +
          dept.subcategories.reduce(
            (subSum, sub) => subSum + sub.nominees.length,
            0
          ),
        0
      );
    return { totalVotes, totalCategories, totalNominees };
  }, [results, categories, departments]);

  const handleTogglePortalMode = async () => {
    setIsProcessingModal(true);
    try {
      const res = await api.post("/toggle-portal-mode", {}, authHeaders(adminToken));
      setPortalMode(res.data.newPortalMode);
    } catch {
      alert("Failed to change portal mode.");
    } finally {
      setIsProcessingModal(false);
      setModalState({ ...modalState, isOpen: false });
    }
  };

  const handleToggleElectionStatus = async () => {
    setIsProcessingModal(true);
    try {
      const res = await api.post("/toggle-election", {}, authHeaders(adminToken));
      setElectionStatus(res.data.newStatus);
    } catch {
      alert("Failed to change status.");
    } finally {
      setIsProcessingModal(false);
      setModalState({ ...modalState, isOpen: false });
    }
  };

  const handleDeleteAllNominations = async () => {
    setIsProcessingModal(true);
    try {
      const res = await api.post("/delete-nominations", {}, authHeaders(adminToken));
      alert(res.data.message);
      setPendingNominations([]);
    } catch {
      alert("Failed to delete nominations.");
    } finally {
      setIsProcessingModal(false);
      setModalState({ ...modalState, isOpen: false });
    }
  };

  useEffect(() => {
    document.title = `${organization.electionTitle} | Admin Dashboard`;
  }, []);

  // --- RENDER LOGIC ---

  if (isCheckingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen text-center text-xl text-slate-400">
        Checking Admin Session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AdminLogin
        onLogin={handleLogin}
        isLoggingIn={isLoggingIn}
        error={error}
      />
    );
  }

  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-center text-xl text-slate-400">
        Loading Dashboard...
      </div>
    );
  }

  const sidebarItems = [
    { key: "results", label: "Live Results", icon: BarChart3 },
    { key: "tabular", label: "Table View", icon: ListChecks },
    { key: "nominations", label: "Nominations", icon: FileText, count: nominationTotal },
    { key: "setup", label: "Setup", icon: SlidersHorizontal },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  const activePageLabel =
    sidebarItems.find((item) => item.key === activeTab)?.label || "Dashboard";

  const navigateAdmin = (key: string) => {
    setActiveTab(key);
    setIsSidebarOpen(false);
  };

  const sidebar = (isMobile = false) => (
    <aside
      className={`flex h-full w-72 flex-col border-r border-slate-800 bg-slate-950 ${
        isMobile ? "shadow-2xl shadow-black/50" : ""
      }`}
    >
      <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={assetUrl(organization.logo)}
            alt={`${organization.shortName} logo`}
            className="h-10 w-10 flex-shrink-0 object-contain"
          />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold uppercase tracking-wide text-white">
              {organization.shortName} Admin
            </h1>
            <p className="truncate text-xs text-slate-400">{organization.year} election</p>
          </div>
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <div className="mb-5 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Election Status</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold text-white">{organization.electionTitle}</span>
            <span
              className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${
                electionStatus === "open"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-red-500/15 text-red-300"
              }`}
            >
              {electionStatus}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold text-white">Portal Mode</span>
            <span className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${portalMode === "nominations" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
              {portalMode}
            </span>
          </div>
        </div>

        <nav className="space-y-1" aria-label="Admin sections">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigateAdmin(item.key)}
                className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold transition ${
                  isActive
                    ? "bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/20"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {!!item.count && (
                  <span
                    className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs ${
                      isActive ? "bg-slate-950 text-amber-300" : "bg-red-500 text-white"
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-800 p-3">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="mb-2 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-900 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>Refresh Data</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setIsAuthenticated(false);
            setAdminToken("");
            sessionStorage.removeItem("adminToken");
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-900 hover:text-white"
        >
          <LogOut className="h-5 w-5" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="w-full min-h-screen bg-slate-950 text-white">
        <ConfirmationModal
          {...modalState}
          onClose={() => setModalState({ ...modalState, isOpen: false })}
          isProcessing={isProcessingModal}
        />
        <ResetElectionModal
          isOpen={isResetModalOpen}
          onClose={() => setIsResetModalOpen(false)}
          onConfirmReset={handleResetElection}
        />

        {/* --- FIX: Hidden div for PDF generation now gets populated with data --- */}
        <div
          id="pdf-report"
          style={{
            position: "absolute",
            left: "-9999px",
            width: "800px",
            padding: "0", // Padding is now handled internally
            backgroundColor: "white",
            color: "#333", // Darker text for better readability
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          {/* Branded Header */}
          <div
            style={{
              backgroundColor: "#1E293B",
              color: "white",
              padding: "30px 40px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <img
              src={assetUrl(organization.logo)}
              alt={`${organization.shortName} Logo`}
              style={{ width: "80px", height: "auto", marginRight: "20px" }}
            />
            <div>
              <h1 style={{ fontSize: "28px", fontWeight: "bold", margin: 0 }}>
                {organization.electionTitle} {organization.year}
              </h1>
              <p
                style={{
                  fontSize: "20px",
                  margin: "5px 0 0 0",
                  color: "#CBD5E1",
                }}
              >
                Annual Awards Results
              </p>
            </div>
          </div>

          <div style={{ padding: "30px 40px" }}>
            {/* Loop through the groups */}
            {Object.entries(groupedAndFilteredResults).map(
              ([groupKey, groupResults]) =>
                groupResults.length > 0 && (
                  <div
                    key={groupKey}
                    style={{ marginBottom: "30px", pageBreakInside: "avoid" }}
                  >
                    {/* Main Group Title */}
                    <h2
                      style={{
                        fontSize: "24px",
                        fontWeight: "bold",
                        color: "#D97706",
                        borderBottom: "2px solid #FBBF24",
                        paddingBottom: "10px",
                        marginBottom: "20px",
                        pageBreakAfter: "avoid",
                      }}
                    >
                      {groupTitles[groupKey as keyof typeof groupTitles]}
                    </h2>

                    {/* Loop through each category result within the group */}
                    {groupResults.map((result) => (
                      <div
                        key={result.category}
                        style={{
                          marginBottom: "30px",
                          pageBreakInside: "avoid",
                        }}
                      >
                        <h3
                          style={{
                            fontSize: "18px",
                            fontWeight: "bold",
                            color: "#374151",
                            borderBottom: "1px solid #E5E7EB",
                            paddingBottom: "8px",
                            marginBottom: "12px",
                          }}
                        >
                          {getCategoryTitle(result.category)}
                        </h3>
                        <ul
                          style={{ listStyle: "none", padding: 0, margin: 0 }}
                        >
                          {result.nominees
                            .sort((a, b) => b.votes - a.votes)
                            .map((nominee, index) => (
                              <li
                                key={nominee.name}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  padding: "10px 12px",
                                  fontSize: "16px",
                                  borderRadius: "4px",
                                  // Highlight the winner and use zebra striping
                                  backgroundColor:
                                    index === 0
                                      ? "#FFFBEB"
                                      : index % 2 === 1
                                      ? "#F9FAFB"
                                      : "white",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: index === 0 ? "bold" : "normal",
                                  }}
                                >
                                  {index === 0 ? "🏆 " : ""}
                                  {nominee.name}
                                </span>
                                <span
                                  style={{
                                    fontWeight: "bold",
                                    color: "#4B5563",
                                  }}
                                >
                                  {nominee.votes}{" "}
                                  {nominee.votes === 1 ? "Vote" : "Votes"}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )
            )}
          </div>
        </div>

        <div className="min-h-screen">
          <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">
            {sidebar()}
          </div>

          {isSidebarOpen && (
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
              <button
                type="button"
                aria-label="Close sidebar overlay"
                className="absolute inset-0 bg-black/60"
                onClick={() => setIsSidebarOpen(false)}
              />
              <div className="relative h-full">{sidebar(true)}</div>
            </div>
          )}

          <main className="min-w-0 flex-1 lg:pl-72">
            <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
              <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(true)}
                    className="mt-1 rounded-md border border-slate-800 bg-slate-900 p-2 text-slate-200 hover:bg-slate-800 lg:hidden"
                    aria-label="Open sidebar"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                  <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Dashboard</span>
                  </div>
                    <h2 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{activePageLabel}</h2>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-12 sm:pl-0">
                  <button
                    onClick={handleDownloadPdf}
                    disabled={isDownloading}
                    className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isDownloading ? "Preparing" : activeTab === "nominations" ? "Export Nomination Report" : "Export PDF"}</span>
                  </button>
                </div>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <p className="text-slate-400 text-sm">Total Votes</p>
                  <p className="text-2xl font-bold text-amber-400">
                    {stats.totalVotes.toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <p className="text-slate-400 text-sm">Categories</p>
                  <p className="text-2xl font-bold text-amber-400">
                    {stats.totalCategories}
                  </p>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <p className="text-slate-400 text-sm">Nominees</p>
                  <p className="text-2xl font-bold text-amber-400">
                    {stats.totalNominees}
                  </p>
                </div>
              </div>

        {activeTab === "results" && (
          <Suspense fallback={<div className="text-slate-400">Loading results...</div>}>
            <ResultsTab
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              results={results}
              groupedAndFilteredResults={groupedAndFilteredResults}
              getCategoryTitle={getCategoryTitle}
            />
          </Suspense>
        )}
        {activeTab === "tabular" && (
          <Suspense fallback={<div className="text-slate-400">Loading table...</div>}>
            <TabularResultsTab
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              results={results}
              groupedAndFilteredResults={groupedAndFilteredResults}
              getCategoryTitle={getCategoryTitle}
            />
          </Suspense>
        )}
        {activeTab === "nominations" && (
          <NominationsTab
            categoryGroups={nominationCategoryGroups}
            total={nominationTotal}
            submissionTotal={nominationSubmissionTotal}
            page={nominationPage}
            totalPages={nominationTotalPages}
            isLoading={isLoadingNominations}
            getCategoryTitle={getCategoryTitle}
            searchTerm={nominationSearch}
            onSearchChange={(value) => {
              setNominationSearch(value);
              setNominationPage(1);
            }}
            onPageChange={setNominationPage}
            onApproveNomination={async (nominationId) => {
              await api.post("/approve-nomination", { nominationId }, authHeaders(adminToken));
              await fetchNominationPage(adminToken, nominationPage, nominationSearch);
            }}
            onRejectNomination={async (nominationId) => {
              await api.post("/reject-nomination", { nominationId }, authHeaders(adminToken));
              await fetchNominationPage(adminToken, nominationPage, nominationSearch);
            }}
          />
        )}
        {activeTab === "settings" && (
          <SettingsTab
            electionStatus={electionStatus}
            portalMode={portalMode}
            onTogglePortalModeClick={() =>
              setModalState({
                isOpen: true,
                title: `Switch to ${portalMode === "nominations" ? "Voting" : "Nominations"} Mode`,
                message: portalMode === "nominations"
                  ? "This will switch the public portal from Nominations to Voting mode. Users will now see the voting interface instead of the nomination form."
                  : "This will switch the public portal back to Nominations mode. Users will see the nomination form instead of the voting interface.",
                onConfirm: handleTogglePortalMode,
                confirmText: `Yes, Switch to ${portalMode === "nominations" ? "Voting" : "Nominations"}`,
              })
            }
            onToggleStatusClick={() =>
              setModalState({
                isOpen: true,
                title: `Confirm: ${
                  electionStatus === "closed" ? "Open" : "Close"
                } Election`,
                message: `Are you sure you want to ${
                  electionStatus === "closed" ? "OPEN" : "CLOSE"
                } the election?`,
                onConfirm: handleToggleElectionStatus,
                confirmText: `Yes, ${
                  electionStatus === "closed" ? "Open" : "Close"
                } Election`,
              })
            }
            onResetElectionClick={() => setIsResetModalOpen(true)}
            onDeleteNominationsClick={() =>
              setModalState({
                isOpen: true,
                title: "Confirm: Delete All Nominations",
                message:
                  "This will permanently delete ALL pending nominations. Are you sure?",
                onConfirm: handleDeleteAllNominations,
                confirmText: "Yes, Delete All",
              })
            }
          />
        )}
        {activeTab === "setup" && (
          <SetupTab
            election={electionSetup}
            departments={departments}
            positions={setupPositions}
            candidates={setupCandidates}
            onSaveElection={saveElectionSetup}
            onSaveDepartment={saveDepartment}
            onDeleteDepartment={deleteDepartment}
            onSavePosition={savePosition}
            onDeletePosition={deletePosition}
            onSaveCandidate={saveCandidate}
            onDeleteCandidate={deleteCandidate}
          />
        )}
      </div>
      </main>
      </div>
    </div>
  );
};

export default AdminPage;
