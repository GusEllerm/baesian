// Shared content for the three drum prototypes (BRIEF.md): one session's queue, from the Crumb demo
// (a made-up bakery's online shop, with two agents at work). The first eight start answered; the ninth is in play.

export const MARKS = {
  common: "M -5.2 0 a 5.2 5.2 0 1 0 10.4 0 a 5.2 5.2 0 1 0 -10.4 0",
  uncommon: "M 0 -6.5 L 5.72 0 L 0 6.5 L -5.72 0 Z",
  rare: "M 0 -6.76 L 1.68 -2.31 L 6.43 -2.09 L 2.72 0.88 L 3.97 5.47 L 0 2.86 L -3.97 5.47 L -2.72 0.88 L -6.43 -2.09 L -1.68 -2.31 Z",
  mythic: "M -6.76 4.68 L -6.76 -2.6 L -3.12 0.52 L 0 -5.72 L 3.12 0.52 L 6.76 -2.6 L 6.76 4.68 Z",
};
export const MARK_INK = {
  common: ["#F0E4BE", "#2E2343"],
  uncommon: ["#F0E4BE", "#6d7482"],
  rare: ["#f6e3a4", "#B8860B"],
  mythic: ["#f3d58a", "#6E1F2E"],
};
export const STAKES = { common: "Easy to undo", uncommon: "Costly to undo", rare: "Hard to undo", mythic: "Hard to undo, touches security" };

/** Each card: what the client shows. `pick` is the agent's option ("a" or "b"), hidden until you choose. */
export const CARDS = [
  { id: "B-4h2mx", title: "Where a signed-in shopper's session lives", agent: "claude-code", doing: "writing the sign-in endpoint", rarity: "mythic", stopped: true,
    question: "Where should a signed-in shopper's session be kept?", crux: "Will anything but the shop's own website call the API?",
    fact: "The shop is a website today; a mobile app has been mentioned for next year, not planned.",
    a: { name: "An HttpOnly cookie", if: "If only the website will", then: "no script on the page can read it, and every form carries a CSRF token" },
    b: { name: "A token in localStorage", if: "If a mobile app will too", then: "any script on the page can read it, and a mobile app could use the API unchanged" }, pick: "a" },
  { id: "B-w5hps", title: "How prices are stored", agent: "codex", doing: "creating the products table", rarity: "rare", stopped: true,
    question: "How should prices be stored in the database?", crux: "Will anything be priced in fractions of a cent?",
    fact: "Flour and coffee beans are sold by weight, priced per 100 g, at €0.80 and €2.40.",
    a: { name: "Whole cents, as integers", if: "If nothing will", then: "a €4.50 loaf is stored as 450; sums are exact" },
    b: { name: "Decimals with four places", if: "If something will", then: "a price per gram fits, and every total is rounded at checkout" }, pick: "a" },
  { id: "B-9wq3t", title: "What deleting an account removes", agent: "claude-code", doing: "adding \"Delete my account\"", rarity: "mythic", stopped: false,
    question: "What should happen when a shopper deletes their account?", crux: "Should a shopper be able to undo deleting their account?",
    fact: "Invoices are kept six years. Last year, 3 of about 40 shoppers who deleted their account asked for it back.",
    a: { name: "Erase it at once", if: "If deleting should be final", then: "name, email and address are erased straight away; invoices keep the amounts" },
    b: { name: "Lock it for 30 days", if: "If it should be undoable for a while", then: "signing in within 30 days restores it; after that it's erased" }, pick: "a" },
  { id: "B-k8n2d", title: "How new orders reach the kitchen", agent: "codex", doing: "building the kitchen's order screen", rarity: "uncommon", stopped: false,
    question: "How should new orders reach the kitchen screen?", crux: "Will the kitchen screen ever need to send live data back?",
    fact: "Today the screen only shows orders; bakers mark one done about once a minute at the busiest time.",
    a: { name: "Server-sent events", if: "If it won't", then: "one stream from the server; marking an order done is an ordinary request" },
    b: { name: "WebSockets", if: "If it will", then: "a two-way connection, through the ws package" }, pick: "a" },
  { id: "B-p3sld", title: "What the menu shows for sold-out items", agent: "codex", doing: "adding today's stock to the menu", rarity: "common", stopped: false,
    question: "What should the menu show for an item that's sold out today?", crux: "Which matters more: the whole range, or only what can be bought?",
    fact: "On a usual Saturday, about a third of the menu has sold out by 11 a.m.",
    a: { name: "Show it, greyed out", if: "If the whole range", then: "it stays in place, marked \"Sold out today\", with no add button" },
    b: { name: "Hide it until it's back", if: "If only what they can buy", then: "regulars won't see their usual loaf that day" }, pick: "a" },
  { id: "B-t6vre", title: "When pickup slots close", agent: "claude-code", doing: "writing the pickup-slot picker", rarity: "common", stopped: false,
    question: "How long before a pickup slot should it stop taking orders?", crux: "Can the bakers fill an order in under an hour?",
    fact: "Most orders are three to six items; the bakers say twenty minutes on a quiet morning.",
    a: { name: "One hour before", if: "If they usually can't", then: "orders close an hour ahead; fewer late scrambles" },
    b: { name: "Twenty minutes before", if: "If they usually can", then: "shoppers can order later; Saturdays may run tight" }, pick: "a" },
  { id: "B-m2qzc", title: "Where receipt emails come from", agent: "claude-code", doing: "sending order receipts", rarity: "uncommon", stopped: false,
    question: "Which service should send the shop's receipt emails?", crux: "Will the shop send more than receipts, such as newsletters?",
    fact: "The shop sends about 60 receipts a day; a newsletter has been talked about.",
    a: { name: "A transactional service", if: "If only receipts", then: "one small dependency; newsletters would need another tool later" },
    b: { name: "A marketing platform", if: "If newsletters too", then: "receipts and newsletters in one place, at a monthly fee" }, pick: "a" },
  { id: "B-c4xrn", title: "How the kitchen marks an order done", agent: "codex", doing: "adding the done button", rarity: "common", stopped: false,
    question: "How should a baker mark an order done on the kitchen screen?", crux: "Do bakers have floury hands when they finish an order?",
    fact: "The screen is a tablet on the wall by the ovens.",
    a: { name: "One big tap", if: "If they do", then: "a large button per order; a mistaken tap is undone from a list" },
    b: { name: "Swipe the order away", if: "If they don't", then: "fewer mistaken taps; swiping with floury hands is unreliable" }, pick: "a" },
  // In play: the first unanswered card.
  { id: "B-r8fdy", title: "What a shopper sees when payment fails", agent: "claude-code", doing: "handling payment errors at checkout", rarity: "uncommon", stopped: true,
    question: "What should a shopper see when their payment fails?", crux: "Do most payment failures need the shopper to act, or do they clear on retry?",
    fact: "The payment provider's logs show about 2% of payments fail, most of them declined cards.",
    a: { name: "Say why, keep the basket", if: "If most need the shopper to act", then: "the reason in plain words, the basket kept, and the payment form open again" },
    b: { name: "Retry once, quietly", if: "If most clear on retry", then: "one automatic retry, then the same message; a little slower when the card is declined" }, pick: "a" },
  { id: "B-x7hwa", title: "How long the basket is kept", agent: "codex", doing: "saving baskets between visits", rarity: "common", stopped: false,
    question: "How long should a shopper's basket be kept if they leave?", crux: "Do shoppers come back the same day, or later in the week?",
    fact: "Half of returning shoppers come back within two hours; a fifth within a week.",
    a: { name: "Until the end of the day", if: "If the same day", then: "baskets clear overnight, so yesterday's bread isn't ordered by mistake" },
    b: { name: "For a week", if: "If later in the week", then: "a returning shopper finds their basket; stock may have changed" }, pick: "a" },
  { id: "B-f2kcp", title: "Who can see the order history", agent: "claude-code", doing: "building the staff pages", rarity: "rare", stopped: false,
    question: "Which staff should be able to see shoppers' past orders?", crux: "Do counter staff need past orders to serve a shopper?",
    fact: "Counter staff look orders up by name at pickup; the owner reviews them for stock.",
    a: { name: "Counter staff and the owner", if: "If they do", then: "counter staff see orders by name; addresses stay owner-only" },
    b: { name: "The owner only", if: "If they don't", then: "counter staff see only today's pickups" }, pick: "b" },
  { id: "B-h9vnt", title: "What the shop's logs keep", agent: "codex", doing: "setting up the server's logging", rarity: "mythic", stopped: false,
    question: "Should the server's logs keep shoppers' email addresses?", crux: "Will anyone need to trace a request back to a shopper?",
    fact: "Support questions arrive by email about twice a week; the logs go to a third-party service.",
    a: { name: "No: an order number only", if: "If rarely", then: "logs show order numbers; tracing a shopper takes a lookup" },
    b: { name: "Yes, for thirty days", if: "If often", then: "support finds a shopper's requests at once; personal data leaves the shop" }, pick: "a" },
];

/** The answers already given this session, for the first eight cards: which option you chose. */
export const ANSWERED = ["a", "a", "a", "a", "b", "a", "a", "b"];
