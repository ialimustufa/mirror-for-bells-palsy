// Exercise definitions are the product content layer: the UI, daily plan, and session
// runner all read from this single catalog so copy and timing stay in sync.
export const EXERCISES = [
  { id: "eyebrow-raise", name: "Eyebrow Raise", region: "forehead", holdSec: 5, reps: 10, instruction: "Raise both eyebrows as if surprised. Hold gently for 5 seconds, then relax slowly.", tip: "If the affected side won't lift, assist lightly with a finger. Never strain — quality over force." },
  { id: "gentle-frown", name: "Gentle Frown", region: "forehead", holdSec: 4, reps: 8, instruction: "Pull your eyebrows down and inward, as if concentrating. Hold, then relax.", tip: "Watch both brows in the mirror. Aim for symmetric movement, not strength." },
  { id: "eye-close", name: "Soft Eye Closure", region: "eyes", holdSec: 5, reps: 10, instruction: "Slowly close your eyes — don't squeeze. Hold softly for 5 seconds, then open slowly.", tip: "Forceful blinking can encourage synkinesis. Slow and gentle is the goal." },
  { id: "wink", name: "Independent Wink", region: "eyes", holdSec: 2, reps: 6, instruction: "Try to close one eye while keeping the other open. Switch sides each rep.", tip: "This builds independent control. It may feel awkward — that's normal early on." },
  { id: "nose-wrinkle", name: "Nostril Flare", region: "nose", holdSec: 4, reps: 8, instruction: "Flare your nostrils outward, as if taking a deep breath through your nose. Hold gently, then relax.", tip: "If flaring feels stuck, try wrinkling the bridge upward instead — both engage the nasalis muscle group. Keep the rest of your face soft." },
  { id: "cheek-puff", name: "Cheek Puff", region: "cheeks", holdSec: 5, reps: 8, instruction: "Take a breath, puff air into both cheeks, hold, then move air slowly from one cheek to the other.", tip: "If air leaks from the affected side, hold that lip lightly with a finger to build the seal." },
  { id: "cheek-suck", name: "Cheek Suck", region: "cheeks", holdSec: 3, reps: 8, instruction: "Suck your cheeks inward against your teeth, like making a 'fish face'. Hold, then release.", tip: "This activates the buccinator muscle — important for chewing and speech." },
  { id: "closed-smile", name: "Closed Smile", region: "mouth", holdSec: 5, reps: 10, instruction: "Smile with lips closed, lifting both corners of your mouth gently. Hold, then relax.", tip: "This is the cornerstone exercise. Watch both corners rise evenly in the mirror." },
  { id: "open-smile", name: "Open Smile", region: "mouth", holdSec: 5, reps: 8, instruction: "Smile widely, showing your teeth. Hold for 5 seconds, then relax slowly.", tip: "Only progress to this when closed smile feels symmetric. Don't force a wider smile than the affected side allows." },
  { id: "pucker", name: "Lip Pucker", region: "mouth", holdSec: 5, reps: 10, instruction: "Purse your lips forward as if blowing a kiss. Hold for 5 seconds, then relax.", tip: "Use the mirror to keep the pucker centered, not pulled toward the stronger side." },
  { id: "lip-press", name: "Lip Press", region: "mouth", holdSec: 4, reps: 8, instruction: "Press your lips firmly but gently together. Hold, then release.", tip: "Builds the orbicularis oris — important for sealing food and clear speech." },
  { id: "vowel-a", name: "Vowel A Shape", region: "mouth", holdSec: 4, reps: 5, instruction: "Say or silently mouth a slow, open A shape. Hold the jaw open gently, then relax fully.", tip: "Think 'ah'. Keep the mouth opening centered and avoid pulling toward the stronger side." },
  { id: "vowel-e", name: "Vowel E Shape", region: "mouth", holdSec: 4, reps: 5, instruction: "Say or silently mouth a slow E shape. Stretch the lips sideways gently, hold, then relax.", tip: "Think 'ee'. Watch both mouth corners travel evenly without over-smiling." },
  { id: "vowel-i", name: "Vowel I Shape", region: "mouth", holdSec: 4, reps: 5, instruction: "Say or silently mouth a slow I shape. Lift the corners lightly and keep the lips controlled.", tip: "Think 'ih'. This should be smaller and softer than a wide smile." },
  { id: "vowel-o", name: "Vowel O Shape", region: "mouth", holdSec: 4, reps: 5, instruction: "Say or silently mouth a rounded O shape. Hold the lips in a soft circle, then relax.", tip: "Think 'oh'. Keep the circle centered rather than pulled to one side." },
  { id: "vowel-u", name: "Vowel U Shape", region: "mouth", holdSec: 4, reps: 5, instruction: "Say or silently mouth a rounded U shape. Bring the lips forward gently, hold, then relax.", tip: "Think 'oo'. Keep the forward pucker even and avoid clenching." },
  { id: "emoji-smile", name: "Emoji Smile 🙂", region: "emoji", holdSec: 4, reps: 6, instruction: "Make a gentle happy face with lips closed. Hold the smile softly, then relax back to neutral.", tip: "Keep it conversational, not forced. Watch both corners lift at the same speed." },
  { id: "emoji-big-smile", name: "Emoji Big Smile 😄", region: "emoji", holdSec: 4, reps: 5, instruction: "Make a bright open smile, showing teeth only as much as feels comfortable. Hold, then release slowly.", tip: "Use less range if the stronger side pulls too far ahead." },
  { id: "emoji-surprise", name: "Emoji Surprise 😮", region: "emoji", holdSec: 4, reps: 5, instruction: "Raise your eyebrows and make a soft O shape with your mouth, like a surprised face. Hold gently, then relax.", tip: "This links forehead lift with controlled lip rounding. Keep the jaw loose." },
  { id: "emoji-wink", name: "Emoji Wink 😉", region: "emoji", holdSec: 3, reps: 5, instruction: "Make a playful wink expression. Close one eye gently while the mouth stays lightly lifted, then relax.", tip: "Avoid squeezing. The goal is clean eye control without pulling the cheek hard." },
  { id: "emoji-kiss", name: "Emoji Kiss 😘", region: "emoji", holdSec: 4, reps: 5, instruction: "Pucker your lips forward like sending a kiss. Hold the center line steady, then relax.", tip: "Keep the lips centered and soft; do not clench the jaw." },
  { id: "emoji-sad-frown", name: "Emoji Sad Frown ☹️", region: "emoji", holdSec: 4, reps: 5, instruction: "Make a gentle sad face by lowering the mouth corners and lightly drawing the brows together. Hold, then release.", tip: "Use a small expression. Stop if it creates strain around the eye or cheek." },
  { id: "emoji-nose-scrunch", name: "Emoji Nose Scrunch 😖", region: "emoji", holdSec: 4, reps: 5, instruction: "Scrunch your nose lightly as if reacting to a strong smell. Hold the expression, then relax fully.", tip: "Keep the rest of the face soft so the nose and upper lip do the work." },
];

export const EXERCISE_BY_ID = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));
export const PROFILE_STARTER_ASSESSMENT_EXERCISES = [
  "eyebrow-raise",
  "gentle-frown",
  "eye-close",
  "wink",
  "nose-wrinkle",
  "cheek-puff",
  "cheek-suck",
  "closed-smile",
  "open-smile",
  "pucker",
  "lip-press",
  "vowel-a",
  "vowel-e",
  "vowel-o",
];
export const PROFILE_ASSESSMENT_EXERCISES = EXERCISES.map((exercise) => exercise.id);

export const REGIONS = [
  { key: "all", label: "All" },
  { key: "forehead", label: "Forehead" },
  { key: "eyes", label: "Eyes" },
  { key: "nose", label: "Nose" },
  { key: "cheeks", label: "Cheeks" },
  { key: "mouth", label: "Mouth" },
  { key: "emoji", label: "Emoji" },
];

export const PLAN_REGION_ORDER = ["forehead", "eyes", "nose", "cheeks", "mouth", "emoji"];

export const DAILY_ESSENTIALS = ["eyebrow-raise", "eye-close", "nose-wrinkle", "cheek-puff", "closed-smile", "pucker"];

export const MOOD_OPTIONS = [
  { key: "hopeful", label: "Hopeful", emoji: "🌱" },
  { key: "okay", label: "Steady", emoji: "🌤" },
  { key: "tired", label: "Tired", emoji: "🌙" },
  { key: "frustrated", label: "Frustrated", emoji: "🌧" },
];
