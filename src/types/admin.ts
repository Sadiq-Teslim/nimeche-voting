// All your TypeScript interfaces go here
export interface NomineeResult {
  name: string;
  votes: number;
}
export interface CategoryResult {
  category: string;
  nominees: NomineeResult[];
}
export interface CategoryInfo {
  id: string;
  title: string;
  groupKey?: string;
  nominees: { id: string; name: string; imageUrl?: string }[];
}
export interface DepartmentInfo {
  id: string;
  title: string;
  sortOrder?: number;
  subcategories: SubCategoryInfo[];
}
export interface SubCategoryInfo {
    id: string;
    title: string;
    nominees: { id: string; name: string; imageUrl?: string }[];
}
export interface Nomination {
  id: string;
  nominationIds?: string[];
  fullName: string;
  popularName?: string;
  category: string;
  imageUrl?: string;
  nominationCount?: number;
  approvedCount?: number;
  pendingCount?: number;
  rejectedCount?: number;
  submittedAt?: string;
}
export interface NominationCategory {
  id: string;
  title: string;
  sortOrder?: number;
  nominations: Nomination[];
}
export interface ModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText: string;
}

export interface ElectionSetup {
  id: string;
  title: string;
  year: string;
  status: "open" | "closed";
}

export interface PositionSetup {
  id: string;
  title: string;
  groupKey: string;
  departmentId?: string | null;
  sortOrder?: number;
}

export interface CandidateSetup {
  id: string;
  positionId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  status: "pending" | "approved" | "rejected";
}
