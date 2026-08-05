import React, { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import type { CandidateSetup, DepartmentInfo, ElectionSetup, PositionSetup } from "../../../types/admin";
import { organization } from "../../../config/organization";

interface SetupTabProps {
  election: ElectionSetup | null;
  departments: DepartmentInfo[];
  positions: PositionSetup[];
  candidates: CandidateSetup[];
  onSaveElection: (payload: Pick<ElectionSetup, "title" | "year" | "status">) => Promise<void>;
  onSaveDepartment: (payload: { id: string; title: string; sortOrder?: number }) => Promise<void>;
  onDeleteDepartment: (id: string) => Promise<void>;
  onSavePosition: (payload: Omit<PositionSetup, "sortOrder"> & { sortOrder?: number }) => Promise<void>;
  onDeletePosition: (id: string) => Promise<void>;
  onSaveCandidate: (payload: Omit<CandidateSetup, "id">) => Promise<void>;
  onDeleteCandidate: (id: string) => Promise<void>;
}

const emptyPosition: PositionSetup = {
  id: "",
  title: "",
  groupKey: Object.keys(organization.categoryGroups)[0] || "general",
  departmentId: "",
  sortOrder: 0,
};

const SetupTab: React.FC<SetupTabProps> = ({
  election,
  departments,
  positions,
  candidates,
  onSaveElection,
  onSaveDepartment,
  onDeleteDepartment,
  onSavePosition,
  onDeletePosition,
  onSaveCandidate,
  onDeleteCandidate,
}) => {
  const [electionForm, setElectionForm] = useState({
    title: "",
    year: "",
    status: "closed" as "open" | "closed",
  });
  const [departmentForm, setDepartmentForm] = useState({ id: "", title: "", sortOrder: 0 });
  const [positionForm, setPositionForm] = useState<PositionSetup>(emptyPosition);
  const [candidateForm, setCandidateForm] = useState<Omit<CandidateSetup, "id">>({
    positionId: "",
    name: "",
    description: "",
    imageUrl: "",
    status: "approved",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (election) {
      setElectionForm({
        title: election.title,
        year: election.year,
        status: election.status,
      });
    }
  }, [election]);

  const run = async (action: () => Promise<void>) => {
    setIsSaving(true);
    try {
      await action();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-amber-400">Election Setup</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-slate-800 p-5 rounded-lg border border-slate-700">
          <h3 className="font-semibold text-white mb-4">Election</h3>
          <div className="space-y-3">
            <input
              value={electionForm.title}
              onChange={(e) => setElectionForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Election title"
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"
            />
            <input
              value={electionForm.year}
              onChange={(e) => setElectionForm((prev) => ({ ...prev, year: e.target.value }))}
              placeholder="Year"
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"
            />
            <select
              value={electionForm.status}
              onChange={(e) => setElectionForm((prev) => ({ ...prev, status: e.target.value as "open" | "closed" }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"
            >
              <option value="closed">Closed</option>
              <option value="open">Open</option>
            </select>
            <button
              disabled={isSaving}
              onClick={() => run(() => onSaveElection(electionForm))}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold py-2 rounded-md"
            >
              <Save size={16} /> Save Election
            </button>
          </div>
        </div>

        <div className="bg-slate-800 p-5 rounded-lg border border-slate-700">
          <h3 className="font-semibold text-white mb-4">Departments</h3>
          <div className="space-y-3">
            <input
              value={departmentForm.id}
              onChange={(e) => setDepartmentForm((prev) => ({ ...prev, id: e.target.value }))}
              placeholder="department-id"
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"
            />
            <input
              value={departmentForm.title}
              onChange={(e) => setDepartmentForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Department title"
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"
            />
            <button
              disabled={isSaving}
              onClick={() => run(async () => {
                await onSaveDepartment(departmentForm);
                setDepartmentForm({ id: "", title: "", sortOrder: 0 });
              })}
              className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 font-semibold py-2 rounded-md"
            >
              <Plus size={16} /> Save Department
            </button>
          </div>
          <ul className="mt-4 space-y-2">
            {departments.map((department) => (
              <li key={department.id} className="flex items-center justify-between bg-slate-900 rounded-md p-2">
                <span>{department.title}</span>
                <button onClick={() => run(() => onDeleteDepartment(department.id))} className="text-red-400">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-slate-800 p-5 rounded-lg border border-slate-700">
          <h3 className="font-semibold text-white mb-4">Positions</h3>
          <div className="space-y-3">
            <input
              value={positionForm.id}
              onChange={(e) => setPositionForm((prev) => ({ ...prev, id: e.target.value }))}
              placeholder="position-id"
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"
            />
            <input
              value={positionForm.title}
              onChange={(e) => setPositionForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Position title"
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"
            />
            <select
              value={positionForm.groupKey}
              onChange={(e) => setPositionForm((prev) => ({ ...prev, groupKey: e.target.value as PositionSetup["groupKey"] }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"
            >
              {Object.entries(organization.categoryGroups).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={positionForm.departmentId || ""}
              onChange={(e) => setPositionForm((prev) => ({ ...prev, departmentId: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"
            >
              <option value="">No department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.title}</option>
              ))}
            </select>
            <button
              disabled={isSaving}
              onClick={() => run(async () => {
                await onSavePosition(positionForm);
                setPositionForm(emptyPosition);
              })}
              className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 font-semibold py-2 rounded-md"
            >
              <Plus size={16} /> Save Position
            </button>
          </div>
          <ul className="mt-4 space-y-2 max-h-56 overflow-auto">
            {positions.map((position) => (
              <li key={position.id} className="flex items-center justify-between bg-slate-900 rounded-md p-2">
                <span>{position.title}</span>
                <button onClick={() => run(() => onDeletePosition(position.id))} className="text-red-400">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-slate-800 p-5 rounded-lg border border-slate-700">
        <h3 className="font-semibold text-white mb-4">Candidates</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={candidateForm.positionId}
            onChange={(e) => setCandidateForm((prev) => ({ ...prev, positionId: e.target.value }))}
            className="bg-slate-900 border border-slate-700 rounded-md p-2"
          >
            <option value="">Select position</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>{position.title}</option>
            ))}
          </select>
          <input
            value={candidateForm.name}
            onChange={(e) => setCandidateForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Candidate name"
            className="bg-slate-900 border border-slate-700 rounded-md p-2"
          />
          <input
            value={candidateForm.description || ""}
            onChange={(e) => setCandidateForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Description"
            className="bg-slate-900 border border-slate-700 rounded-md p-2"
          />
          <input
            value={candidateForm.imageUrl || ""}
            onChange={(e) => setCandidateForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
            placeholder="Image URL"
            className="bg-slate-900 border border-slate-700 rounded-md p-2"
          />
          <button
            disabled={isSaving}
            onClick={() => run(async () => {
              await onSaveCandidate(candidateForm);
              setCandidateForm({ positionId: "", name: "", description: "", imageUrl: "", status: "approved" });
            })}
            className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold py-2 rounded-md"
          >
            <Plus size={16} /> Save
          </button>
        </div>
        <ul className="mt-4 divide-y divide-slate-700">
          {candidates.filter((candidate) => candidate.status !== "rejected").map((candidate) => (
            <li key={candidate.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-semibold">{candidate.name}</p>
                <p className="text-sm text-slate-400">
                  {positions.find((position) => position.id === candidate.positionId)?.title || candidate.positionId}
                </p>
              </div>
              <button onClick={() => run(() => onDeleteCandidate(candidate.id))} className="text-red-400">
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default SetupTab;
