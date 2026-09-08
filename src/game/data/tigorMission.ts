export interface TigorVetTask {
  id: string;
  label: string;
  prompt: string;
  choices: [string, string, string];
  correct: number;
  success: string;
}

export const TIGOR_LEGAL_NAME = "Chloe Louise Cranfield";

export const TIGOR_VET_TASKS: TigorVetTask[] = [
  { id: "appointment", label: "Vet appointment", prompt: "An 8:10 AM slot appeared for tomorrow. It may vanish in 0.2 seconds.", choices: ["TAKE IT", "Think for a moment", "Join another queue"], correct: 0, success: "APPOINTMENT CAPTURED. The calendar hisses." },
  { id: "microchip", label: "Microchip scan", prompt: "The scanner refuses to acknowledge one extremely real cat.", choices: ["Scan at shoulder blades", "Scan Chloe's handbag", "Restart the entire government"], correct: 0, success: "BEEP. Tigor exists legally." },
  { id: "rabies", label: "Rabies vaccination", prompt: "The date field wants the valid vaccination certificate.", choices: ["Current certificate", "Tesco receipt", "Tigor's personal statement"], correct: 0, success: "Vaccination verified." },
  { id: "internal", label: "Internal parasite treatment", prompt: "Choose the treatment record the importer will accept.", choices: ["Documented dose and time", "A confident thumbs-up", "An astrology chart"], correct: 0, success: "Internal treatment recorded to the minute." },
  { id: "external", label: "External parasite treatment", prompt: "One more treatment. Because of course there is one more treatment.", choices: ["Use the scheduled vet dose", "Tick it with a crayon", "Ask Tigor to self-certify"], correct: 0, success: "External treatment signed and dated." },
  { id: "health", label: "Health paperwork", prompt: "Reception asks which record belongs in the health bundle.", choices: ["Complete stamped record", "A cute photo album", "An unread email chain"], correct: 0, success: "HEALTH PAPERWORK complete. The printer looks disappointed." },
  { id: "certificate", label: "Export health certificate", prompt: "The export certificate needs one last signature.", choices: ["Any nearby toddler", "The vending machine", "The authorised vet"], correct: 2, success: "UK EXPORT DOCUMENTS: signed and stamped." },
  { id: "fit", label: "Fit-to-fly exam", prompt: "Final exam. Tigor is glaring at the stethoscope.", choices: ["Bribe with treats, then examine", "Challenge him to a duel", "Pretend there is no cat"], correct: 0, success: "FIT TO FLY. The UK vet boss has fallen." },
];

export interface TigorUaePhase {
  label: string;
  prompt: string;
  choices?: [string, string, string];
  correct?: number;
  success: string;
}

export const TIGOR_UAE_PHASES: TigorUaePhase[] = [
  { label: "TAMM APP", prompt: "Choose the service hidden under four nearly identical menus.", choices: ["Import permit · companion animal", "Parking permit · camel", "Report a suspicious PDF"], correct: 0, success: "Correct service found. Only seventeen screens remain." },
  { label: "CALL CENTRE", prompt: "The automated voice asks why you are calling.", choices: ["Say agent until something breaks", "Order shawarma", "Hang up and move countries"], correct: 0, success: "A human being has entered the battle." },
  { label: "MINISTRY FORM", prompt: "Upload the one document the portal has not forgotten.", choices: ["Vet certificate PDF", "Screenshot of a PDF", "Photo of Tigor judging the PDF"], correct: 0, success: "UPLOAD ACCEPTED. Nobody move." },
  { label: "OWNER NAME CHECK", prompt: "Enter Chloe's full legal name exactly.", success: "IDENTITY COMBO ACCEPTED." },
  { label: "FINAL APPROVAL", prompt: "The application is marked 'returned for clarification'. Respond.", choices: ["Attach the indexed evidence bundle", "Send seventeen question marks", "Begin a new identity"], correct: 0, success: "IMPORT PERMIT APPROVED." },
];

export type AllNighterAction = "CALL" | "UPLOAD" | "STAMP" | "CHECK";

export const TIGOR_ALL_NIGHT_TASKS: Array<{ label: string; action: AllNighterAction; note: string }> = [
  { label: "Call the emergency vet line", action: "CALL", note: "Hold music develops a second movement." },
  { label: "Upload microchip certificate", action: "UPLOAD", note: "PDF 1 enters the portal." },
  { label: "Verify every digit", action: "CHECK", note: "One zero was attempting escape." },
  { label: "Get clinic export stamp", action: "STAMP", note: "THUNK. Bureaucracy takes 8 damage." },
  { label: "Call cargo desk", action: "CALL", note: "A person says 'one moment' for 43 minutes." },
  { label: "Upload fit-to-fly scan", action: "UPLOAD", note: "PDF 2 survives compression." },
  { label: "Check owner name", action: "CHECK", note: "Chloe Louise Cranfield. Still Chloe Louise Cranfield." },
  { label: "Stamp permit cover sheet", action: "STAMP", note: "The stamp pad is now a team member." },
  { label: "Call ministry escalation", action: "CALL", note: "Juju deploys Professional Voice." },
  { label: "Upload titer result", action: "UPLOAD", note: "The progress bar moves. Everybody cries." },
  { label: "Check flight manifest", action: "CHECK", note: "Tigor has an aisle preference now." },
  { label: "Stamp final declaration", action: "STAMP", note: "FINAL stamp. Probably." },
  { label: "Call airport animal desk", action: "CALL", note: "They say yes. Juju asks them to say it again." },
  { label: "Upload the full bundle", action: "UPLOAD", note: "Every PDF leaves the group chat together." },
  { label: "Check submission receipt", action: "CHECK", note: "Reference number captured in twelve places." },
  { label: "Stamp APPROVED", action: "STAMP", note: "TIGOR IS CLEARED TO FLY." },
];
