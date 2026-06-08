// Utility functions for getting status colors based on configuration

interface Status {
  id: string;
  label: string;
}

// Map English status labels to translation keys
const jobStatusTranslationKeys: Record<string, string> = {
  "N/D": "nd",
  "Offen": "offen",
  "Active": "active",
  "Not available": "notAvailable",
  "Nicht offen": "nichtOffen",
  "Assignment": "assignment",
  "Placed": "placed",
  "Archived": "archived"
};

export function getJobStatusTranslationKey(statusLabel: string): string {
  return jobStatusTranslationKeys[statusLabel] || statusLabel;
}

const defaultColorMap: Record<string, string> = {
  // Candidate statuses
  "N/D": "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  "Active": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "Passive": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  "Not available": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  "Placed": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "Archived": "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  
  // Client + Job statuses (German)
  "Nicht offen": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  "Partner": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  
  // Job statuses (Offen used for both clients and jobs - violet)
  "Offen": "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  "Assignment": "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  
  // Recruiting stages
  "Austausch ausstehend": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  "Unterlagen offen": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "Unterlagen geschickt": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  "Ready2Push": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "Ready2Send": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  
  // Match stages
  "Vorgestellt": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "Shared": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  "Inquiry": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "Invitation": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  "Interview 1": "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  "Interview 2": "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200",
  "Trial Day": "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  "Offered": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const colorPalette = [
  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
];

export function getStatusColor(statusLabel: string): string {
  // First check if there's a default color mapping
  if (defaultColorMap[statusLabel]) {
    return defaultColorMap[statusLabel];
  }
  
  // Otherwise, assign a color based on hash of the label
  const hash = statusLabel.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  
  const index = Math.abs(hash) % colorPalette.length;
  return colorPalette[index];
}

export function getStatusOptions(statuses: Status[]): Array<{ id: string; title: string; color: string }> {
  return statuses.map(status => ({
    id: status.id,
    title: status.label,
    color: getStatusColor(status.label)
  }));
}
