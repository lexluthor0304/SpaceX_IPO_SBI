/**
 * SBI Securities IPO Page Checker
 *
 * Fetches the SBI IPO page and checks whether the 「購入申込する」
 * (Apply for Purchase) button is present and enabled.
 *
 * Supports conditional requests via ETag to minimize server load.
 */

export interface CheckResult {
  buttonFound: boolean;
  buttonEnabled: boolean;
  buttonText: string | null;
  pageTitle: string | null;
  responseTimeMs: number;
  error: string | null;
  debugSnippet: string | null;
  statusInfo: string | null;
  /** HTTP status code */
  httpStatus: number;
  /** New ETag from response (for next conditional request) */
  etag: string | null;
  /** Whether the page was modified (false = 304 Not Modified) */
  modified: boolean;
}

/**
 * Check the SBI IPO page for the 「購入申込する」button.
 *
 * @param pageUrl The SBI IPO page URL
 * @param lastEtag The ETag from the previous response, for conditional request
 * @returns CheckResult with button status and new ETag
 */
export async function checkIPOButton(
  pageUrl: string,
  lastEtag?: string | null
): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    };

    // Conditional request: only fetch if page changed since last check
    if (lastEtag) {
      headers["If-None-Match"] = lastEtag;
    }

    const response = await fetch(pageUrl, {
      headers,
      redirect: "follow",
    });

    const responseTimeMs = Date.now() - startTime;
    const newEtag = response.headers.get("etag") || null;

    // 304 Not Modified — page hasn't changed, skip parsing
    if (response.status === 304) {
      return {
        buttonFound: false,
        buttonEnabled: false,
        buttonText: null,
        pageTitle: null,
        responseTimeMs,
        error: null,
        debugSnippet: null,
        statusInfo: "ページ未更新（304 Not Modified）",
        httpStatus: 304,
        etag: lastEtag ?? newEtag, // keep existing etag
        modified: false,
      };
    }

    if (!response.ok) {
      return {
        buttonFound: false,
        buttonEnabled: false,
        buttonText: null,
        pageTitle: null,
        responseTimeMs,
        error: `HTTP ${response.status}: ${response.statusText}`,
        debugSnippet: null,
        statusInfo: null,
        httpStatus: response.status,
        etag: null,
        modified: true,
      };
    }

    // Validate content type
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return {
        buttonFound: false,
        buttonEnabled: false,
        buttonText: null,
        pageTitle: null,
        responseTimeMs,
        error: `Unexpected content type: ${contentType}`,
        debugSnippet: null,
        statusInfo: null,
        httpStatus: response.status,
        etag: newEtag,
        modified: true,
      };
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : null;

    const result = analyzeButtonState(html);

    return {
      ...result,
      pageTitle,
      responseTimeMs: Date.now() - startTime,
      error: null,
      httpStatus: response.status,
      etag: newEtag,
      modified: true,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      buttonFound: false,
      buttonEnabled: false,
      buttonText: null,
      pageTitle: null,
      responseTimeMs: Date.now() - startTime,
      error: message,
      debugSnippet: null,
      statusInfo: null,
      httpStatus: 0,
      etag: null,
      modified: true,
    };
  }
}

/**
 * Analyze the HTML to determine the state of the 「購入申込する」button.
 */
function analyzeButtonState(html: string): {
  buttonFound: boolean;
  buttonEnabled: boolean;
  buttonText: string | null;
  debugSnippet: string | null;
  statusInfo: string | null;
} {
  const debugSnippets: string[] = [];

  // Pattern 1: <input type="submit"> or <input type="button">
  const inputPattern = /<input[^>]*?(?:value|alt)\s*=\s*["']購入申込[^"']*["'][^>]*>/gi;
  const inputMatches = html.match(inputPattern);

  if (inputMatches && inputMatches.length > 0) {
    for (const match of inputMatches) {
      debugSnippets.push(match);
      const isDisabled = /disabled/i.test(match) || /readonly/i.test(match);
      if (!isDisabled) {
        return {
          buttonFound: true,
          buttonEnabled: true,
          buttonText: "購入申込する",
          debugSnippet: match.substring(0, 300),
          statusInfo: "購入申込ボタンが有効です！",
        };
      }
      return {
        buttonFound: true,
        buttonEnabled: false,
        buttonText: "購入申込する",
        debugSnippet: match.substring(0, 300),
        statusInfo: "購入申込ボタンは表示されていますが、現在無効化されています（申込期間前の可能性があります）。",
      };
    }
  }

  // Pattern 2: <a> tag with button text
  const anchorPattern = /<a[^>]*>[^<]*購入申込[^<]*<\/a>/gi;
  const anchorMatches = html.match(anchorPattern);

  if (anchorMatches && anchorMatches.length > 0) {
    for (const match of anchorMatches) {
      debugSnippets.push(match);
      const isDisabled =
        /disabled/i.test(match) ||
        /class="[^"]*disable[^"]*"/i.test(match) ||
        /class="[^"]*off[^"]*"/i.test(match) ||
        /style="[^"]*display\s*:\s*none/i.test(match);

      if (!isDisabled) {
        return {
          buttonFound: true,
          buttonEnabled: true,
          buttonText: "購入申込する",
          debugSnippet: match.substring(0, 300),
          statusInfo: "購入申込リンクが有効です！",
        };
      }
      return {
        buttonFound: true,
        buttonEnabled: false,
        buttonText: "購入申込する",
        debugSnippet: match.substring(0, 300),
        statusInfo: "購入申込リンクは表示されていますが、現在無効化されています。",
      };
    }
  }

  // Pattern 3: <button> element
  const buttonPattern = /<button[^>]*>[^<]*購入申込[^<]*<\/button>/gi;
  const buttonMatches = html.match(buttonPattern);

  if (buttonMatches && buttonMatches.length > 0) {
    for (const match of buttonMatches) {
      debugSnippets.push(match);
      const isDisabled =
        /disabled/i.test(match) ||
        /class="[^"]*disable[^"]*"/i.test(match) ||
        /style="[^"]*display\s*:\s*none/i.test(match);

      if (!isDisabled) {
        return {
          buttonFound: true,
          buttonEnabled: true,
          buttonText: "購入申込する",
          debugSnippet: match.substring(0, 300),
          statusInfo: "購入申込ボタンが有効です！",
        };
      }
    }
    return {
      buttonFound: true,
      buttonEnabled: false,
      buttonText: "購入申込する",
      debugSnippet: buttonMatches[0].substring(0, 300),
      statusInfo: "購入申込ボタンは表示されていますが、現在無効化されています。",
    };
  }

  // Pattern 4: Text containing "購入申込" anywhere
  const textPattern = /購入申込(?:する|へ)?/g;
  const textMatches = html.match(textPattern);

  if (textMatches && textMatches.length > 0) {
    const idx = html.search(textPattern);
    const start = Math.max(0, idx - 100);
    const end = Math.min(html.length, idx + 200);
    const snippet = html.substring(start, end).replace(/\s+/g, " ").trim();

    return {
      buttonFound: false,
      buttonEnabled: false,
      buttonText: textMatches[0],
      debugSnippet: snippet.substring(0, 500),
      statusInfo: "「購入申込」のテキストは見つかりましたが、クリック可能なボタン/リンクとしては検出されませんでした。",
    };
  }

  // Pattern 5: Negative indicators
  const negativePatterns = [
    { pattern: /取扱いません/g, msg: "このIPO銘柄はSBI証券では取扱いません。" },
    { pattern: /お取扱いしません/g, msg: "このIPO銘柄はSBI証券ではお取扱いしません。" },
    { pattern: /申込期間外/g, msg: "現在は申込期間外です。" },
    { pattern: /申込受付中では?ありません/g, msg: "現在、申込受付中ではありません。" },
    { pattern: /申込の受付は終了/g, msg: "申込の受付は終了しました。" },
    { pattern: /取扱中止/g, msg: "このIPO銘柄の取扱いは中止されました。" },
  ];

  for (const { pattern, msg } of negativePatterns) {
    if (pattern.test(html)) {
      return {
        buttonFound: false,
        buttonEnabled: false,
        buttonText: null,
        debugSnippet: null,
        statusInfo: msg,
      };
    }
  }

  // No button found
  const bodyContent = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodySnippet = bodyContent
    ? bodyContent[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 500)
    : html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 500);

  return {
    buttonFound: false,
    buttonEnabled: false,
    buttonText: null,
    debugSnippet: bodySnippet || html.substring(0, 500),
    statusInfo: "「購入申込する」ボタンはページ上に見つかりませんでした。",
  };
}
