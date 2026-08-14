/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import type { VoterInfo } from "../App";
import { X, Loader2 } from "lucide-react";
import { api, assetUrl } from "../api/client";
import { organization } from "../config/organization";

interface ValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (voterInfo: VoterInfo) => void;
}

const ValidationModal: React.FC<ValidationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [matricNumber, setMatricNumber] = useState("");
  const [verificationName, setVerificationName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
  }, [isOpen]);

  const handleValidation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.post("/validate", { matricNumber, verificationName });
      if (response.data.valid) {
        onSuccess({
          fullName: response.data.fullName,
          department: response.data.departmentId || organization.fixedDepartmentId,
          voterToken: response.data.voterToken,
        });
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "An unexpected error occurred. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-md">
      <div className="relative max-w-md w-full rounded-lg border border-[#E8650A]/40 bg-[#0D160A] p-6 shadow-2xl sm:p-8">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-md p-1 text-[#7A9A7C] hover:bg-white/5 hover:text-white transition-colors"
            disabled={isLoading}
            aria-label="Close voter verification"
          >
            <X size={24} />
          </button>

          <div className="text-center mb-6">
            <img
              src={assetUrl(organization.logo)}
              alt="Event Logo"
              className="w-12 h-12 mx-auto mb-4"
            />
            <h2 className="text-3xl font-bold text-[#F2EDE8]">
              Voter Verification
            </h2>
            <p className="text-[#BDD0BE] mt-2">
              Use your Mechanical Engineering class-list details to open the official ballot.
            </p>
          </div>

          <form onSubmit={handleValidation}>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="matricNumber"
                  className="block text-sm font-medium text-[#BDD0BE] mb-1.5"
                >
                  Matric Number
                </label>
                <input
                  type="text"
                  id="matricNumber"
                  value={matricNumber}
                  onChange={(e) => setMatricNumber(e.target.value.replace(/[^0-9\s/-]/g, ""))}
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  className="w-full bg-black/30 border border-[#E8650A]/35 rounded-md px-4 py-3 text-white placeholder:text-[#7A9A7C] focus:outline-none focus:ring-2 focus:ring-[#E8650A]/35 focus:border-[#E8650A]"
                  placeholder="e.g. 210404001"
                />
              </div>
              <div>
                <label
                  htmlFor="verificationName"
                  className="block text-sm font-medium text-[#BDD0BE] mb-1.5"
                >
                  One of Your Names
                </label>
                <input
                  type="text"
                  id="verificationName"
                  value={verificationName}
                  onChange={(e) => setVerificationName(e.target.value)}
                  required
                  autoComplete="name"
                  maxLength={80}
                  className="w-full bg-black/30 border border-[#E8650A]/35 rounded-md px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#E8650A]/35 focus:border-[#E8650A]"
                  placeholder="Enter any name on your class record"
                />
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-[#7A9A7C]">
              Your details are checked privately against the official class list and are not displayed publicly.
            </p>

            {error && (
              <p className="text-red-400 text-center text-sm mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                {error}
              </p>
            )}

            <div className="mt-6">
                <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#E8650A] hover:bg-[#CF5A09] disabled:bg-[#4A5148] disabled:text-[#9AA899] disabled:cursor-not-allowed transition-colors text-white font-bold py-3 rounded-md flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : null}
                {isLoading ? "Validating..." : "Proceed"}
              </button>
            </div>
          </form>
      </div>
    </div>
  );
};

export default ValidationModal;
