/**
 * Bundled quotes for the "Daily Quote" widget. Kept local so the new tab page
 * makes no network request and works offline.
 * @type {{ content: string, author: string }[]}
 */
const QUOTES = [
  { content: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { content: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { content: "Well done is better than well said.", author: "Benjamin Franklin" },
  { content: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { content: "What we think, we become.", author: "Buddha" },
  { content: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { content: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { content: "Stay hungry, stay foolish.", author: "Stewart Brand" },
  { content: "The best way out is always through.", author: "Robert Frost" },
  { content: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { content: "Do one thing every day that scares you.", author: "Eleanor Roosevelt" },
  { content: "Knowing is not enough; we must apply.", author: "Johann Wolfgang von Goethe" },
  { content: "Little by little, one travels far.", author: "J.R.R. Tolkien" },
  { content: "Make each day your masterpiece.", author: "John Wooden" },
  { content: "The journey of a thousand miles begins with one step.", author: "Lao Tzu" },
  { content: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { content: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { content: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { content: "Dream big and dare to fail.", author: "Norman Vaughan" },
  { content: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
  { content: "Whatever you are, be a good one.", author: "Abraham Lincoln" },
  { content: "If you can dream it, you can do it.", author: "Walt Disney" },
  { content: "Be so good they can't ignore you.", author: "Steve Martin" },
  { content: "The harder I work, the luckier I get.", author: "Samuel Goldwyn" },
  { content: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { content: "Nothing will work unless you do.", author: "Maya Angelou" },
  { content: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { content: "Great things are done by a series of small things brought together.", author: "Vincent van Gogh" },
  { content: "Life is really simple, but we insist on making it complicated.", author: "Confucius" },
  { content: "Change your thoughts and you change your world.", author: "Norman Vincent Peale" },
];

/**
 * Same quote for the whole local calendar day.
 * @param {Date} [date]
 */
export function getDailyQuote(date = new Date()) {
  const localDay = Math.floor(
    (date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000,
  );
  return QUOTES[((localDay % QUOTES.length) + QUOTES.length) % QUOTES.length];
}
