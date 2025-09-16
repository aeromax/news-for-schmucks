// Config for selecting Reddit posts to bundle
// Edit these values directly; no env vars needed.

export const redditBundlesConfig = {
  // Reddit timeframe for top posts
  t: 'day', // 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'

  // How many posts to fetch from Reddit and how many to keep for bundling
  limit: 8,      // fetch this many from Reddit
  maxStories: 8,  // keep at most this many for processing

  // Selection strategy
  // Choose sort key: 'comments' | 'ups' | 'comments_per_hour'
  sortBy: 'comments_per_hour',

  // Minimum thresholds to include a post
  minComments: 0,
  minUps: 0,

  // Ignore posts older than this many hours (Infinity = no cap)
  maxAgeHours: 48,

  // Prefer unique domains among selected posts
  diversifyDomains: false,

  // Tone comment selection preferences
  tone: {
    profilesMaxLookups: 12,
    highKarmaThreshold: 10000,
    minAuthorKarma: 0,
    minAuthorAgeDays: 0,
    highKarmaBonus: 0.5,
    lowKarmaPenalty: 0.0,
    unknownAuthorPenalty: 0.0,
    dropBelowThreshold: false,
  },

  // Prompt formatting preferences for LLM input
  prompt: {
    maxCommentsPerStory: 6,
    maxCommentLen: 200,
    // Max characters from a Reddit post's selftext to include
    maxSelftextLen: 300,
    showMeta: false,    // if false, meta below is ignored
    showScore: false,
    showTone: false,
    showCues: false,
    // Control inclusion of links in the prompt
    showArticleUrl: false,
    showRedditLink: false,
    // Include extracted article summary lines
    showArticleSummary: true,
    maxSummaryLen: 320,
    // Add a header label before comment bullets for clarity
    showCommentaryHeader: true,
    // Include an "On This Day" line at the top
    showOnThisDay: true,
    onThisDayLabel: 'On This Day:',
  },
};
