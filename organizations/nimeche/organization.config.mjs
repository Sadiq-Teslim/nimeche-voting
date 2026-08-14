// Level-specific awards (5 categories × 2 genders = 10)
const levelAwards = [
  ["level-rookie-male", "Rookie of the Year (Male)", "level"],
  ["level-rookie-female", "Rookie of the Year (Female)", "level"],
  ["level-sophomore-male", "Sophomore of the Year (Male)", "level"],
  ["level-sophomore-female", "Sophomore of the Year (Female)", "level"],
  ["level-face-3-male", "Face of Year 3 (Male)", "level"],
  ["level-face-3-female", "Face of Year 3 (Female)", "level"],
  ["level-face-4-male", "Face of Year 4 (Male)", "level"],
  ["level-face-4-female", "Face of Year 4 (Female)", "level"],
  ["level-face-5-male", "Face of Year 5 (Male)", "level"],
  ["level-face-5-female", "Face of Year 5 (Female)", "level"],
];

// Department / community awards (10)
const departmentAwards = [
  ["dept-engineering-talent", "Engineering Talent of the Year", "department"],
  ["dept-tech-personality-male", "Tech Personality of the Year (Male)", "department"],
  ["dept-tech-personality-female", "Tech Personality of the Year (Female)", "department"],
  ["dept-sport-personality-male", "Sport Personality of the Year (Male)", "department"],
  ["dept-sport-personality-female", "Sport Personality of the Year (Female)", "department"],
  ["dept-brand", "Brand of the Year", "department"],
  ["dept-cad-wiz", "CAD Wiz of the Year", "department"],
  ["dept-most-fashionable-male", "Most Fashionable (Male)", "department"],
  ["dept-most-fashionable-female", "Most Fashionable (Female)", "department"],
  ["dept-volunteer", "Volunteer of the Year", "department"],
];

const allAwards = [...levelAwards, ...departmentAwards];

export default {
  id: "nimeche",
  public: {
    name: "NIMechE UNILAG SYMPOSIUM 3.0 AWARDS NIGHT",
    shortName: "NIMechE UNILAG SF",
    electionTitle: "NIMechE UNILAG SYMPOSIUM 3.0 AWARDS NIGHT",
    year: "2026",
    logo: "/brand/logo.png",
    favicon: "/brand/logo.png",
    nominationBackground: "/brand/background.jpg",
    logoFilter: "none",
    fontUrl: null,
    fontFamily: "'DM Sans', system-ui, sans-serif",
    displayFontFamily: "'DM Serif Display', Georgia, serif",
    portalMode: "voting",
    fixedDepartmentId: "nimeche",
    voterRequiresDepartment: false,
    categoryGroups: {
      level: "Level-Specific Awards",
      department: "Department Awards",
    },
    colors: {
      primary: "#E8650A",
      secondary: "#2E7D32",
      accent: "#F5A623",
      background: "#0A0D0A",
      surface: "#FFFFFF",
      text: "#1A1F1A",
    },
    apiBaseUrl: "http://localhost:4000/api",
  },
  backend: {
    frontendOrigin: "http://localhost:5173",
    frontendOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
    databaseUrlExample: "postgresql://USER:PASSWORD@HOST:5432/nimeche_voting",
    cloudinaryFolder: "nimeche-awards-2026",
  },
  seed: {
    election: {
      title: "NIMechE UNILAG SYMPOSIUM 3.0 AWARDS NIGHT",
      year: "2026",
      status: "closed",
      portalMode: "voting",
    },
    departments: [
      { id: "nimeche", title: "NIMechE UNILAG SF", sortOrder: 1 },
    ],
    positions: allAwards.map(([id, title, groupKey], index) => ({
      id,
      title,
      groupKey,
      departmentId: "nimeche",
      sortOrder: index + 1,
    })),
    candidates: [],
  },
};
