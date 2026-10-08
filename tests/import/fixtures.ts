export const users = [
  { id: "u-wira", name: "Wira", fullName: "Wira Budi Prasetyo", aliases: [], active: true },
  { id: "u-irsyad", name: "Irsyad", fullName: "Irsyad Ahnaf Fauzian", aliases: ["Irshyad", "irsyad"], active: true },
  { id: "u-fadli", name: "Fadli", fullName: "Muhamad Fadli", aliases: [], active: true },
  { id: "u-fafa", name: "Fafa", fullName: "Fahfil Fauzah", aliases: ["Fafa & Yoel"], active: true },
  { id: "u-rifqy", name: "Rifqy", fullName: "Rifqy", aliases: ["Rifky"], active: true },
  { id: "u-rio", name: "Robertino", fullName: "Robertino", aliases: ["Rio"], active: true },
  { id: "u-daus", name: "Daus", fullName: "Daus", aliases: [], active: false },
];
export const brands = [{ id: "b-clogent", name: "Clogent" }, { id: "b-bw", name: "Bubble Wash" }];
export const divisions = [{ id: "d-creative", name: "Creative" }, { id: "d-social", name: "Social Media" }];
export const ctx = { users, brands, divisions };

export const REQ_HEADERS = ["Requester", "Brand", "Division", "Task", "Brief Link", "Notes", "Request Date", "Deadline", "Request Time", "Days Left", "Designer", "Progress", "Design Folder", "Jumlah Output"];
export const SOC_HEADERS = ["Diisi oleh SocMed Requester", "Brand", "Division", "Platform", "Task", "Brief Link", "Notes", "Published", "Link Upload", "KerKun", "Otomatis Request Date", "Deadline", "Request Time", "Days Left", "Diisi oleh Creative Designer/Editor", "Progress", "Shooting", "Upload", "Edited", "Design Folder", "Jumlah Output", "Month_Key", "Include_KPI"];

export function row(headers: string[], o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(headers.map((h) => [h, o[h] ?? ""]));
}
export const reqRow = (o: Record<string, string>) =>
  row(REQ_HEADERS, { Requester: "Rio", Brand: "Clogent", Division: "Creative", Task: "Banner Promo", "Request Date": "22/05/2026", Deadline: "04/06/2026", "Request Time": "09:00", "Days Left": "Completed", Designer: "Irshyad", Progress: "Done", "Jumlah Output": "2", ...o });
export const socRow = (o: Record<string, string>) =>
  row(SOC_HEADERS, { "Diisi oleh SocMed Requester": "Rifky", Brand: "Bubble Wash", Division: "Social Media", Platform: "TikTok", Task: "Konten Promo", Notes: "CAMPAIGN CONTENT", "Otomatis Request Date": "9/30/2026", Deadline: "10/1/2026", "Days Left": "Completed", "Diisi oleh Creative Designer/Editor": "Fadli", Progress: "Done", Shooting: "TRUE", Upload: "FALSE", Edited: "TRUE", "Jumlah Output": "3", Month_Key: "2026-09", Include_KPI: "Yes", ...o });
