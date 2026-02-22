import { GoogleGenerativeAI } from '@google/generative-ai';
import { NewsItem, IssueItem } from '@/types';
import { matchFrameworks, getFrameworkNames } from './analyzers/framework-matcher';
import { getRecentIssues } from './store';

// Gemini API 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 뉴스 분석 및 인사이트 생성
export async function analyzeNewsAndGenerateInsights(
    newsItems: NewsItem[]
): Promise<IssueItem[]> {
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    // 뉴스를 관련 주제별로 클러스터링
    const clusters = clusterNewsByTopic(newsItems);

    // 중복 방지를 위한 최근 이슈 조회 (지난 3일치)
    const recentIssues = await getRecentIssues(3);
    console.log(`[Deduplication] Loaded ${recentIssues.length} recent issues for comparison.`);

    const issues: IssueItem[] = [];

    // 최대 5개 이슈만 생성
    const topClusters = clusters.slice(0, 5);

    for (const cluster of topClusters) {
        try {
            // 중복 체크 1단계: 헤드라인 유사도 (빠른 필터링)
            const clusterHeadline = cluster[0].title;
            const isPotentialDupe = recentIssues.some(issue =>
                calculateSimilarity(issue.headline, clusterHeadline) > 0.6
            );

            if (isPotentialDupe) {
                console.log(`[Deduplication] Skipping likely duplicate cluster: ${clusterHeadline}`);
                continue;
            }

            const issue = await generateIssueFromCluster(model, cluster);
            if (issue) {
                // 중복 체크 2단계: 생성된 이슈 내용 기반 정밀 체크 (AI 활용 가능하나 비용 절감 위해 키워드/소스 매칭 사용)
                const isDuplicate = await checkDuplicateIssues(issue, recentIssues);
                if (isDuplicate) {
                    console.log(`[Deduplication] Discarded duplicate issue: ${issue.headline}`);
                    continue;
                }
                issues.push(issue);
            }
        } catch (error) {
            console.error('[Gemini Error]', error);
        }
    }

    return issues;
}

// 주제별 뉴스 클러스터링
function clusterNewsByTopic(newsItems: NewsItem[]): NewsItem[][] {
    const clusters = new Map<string, NewsItem[]>();

    for (const item of newsItems) {
        const keyTerms = [
            // 주요 테마
            'Payments', 'Neobank', 'Crypto', 'Blockchain', 'DeFi', 'Embedded Finance', 'BaaS',
            // 기업
            'Stripe', 'Plaid', 'Square', 'PayPal', 'Adyen', 'Revolut', 'Coinbase', 'Robinhood',
            // 정책 및 보안
            'Regulation', 'Compliance', 'Security', 'Fraud', 'CBDC', 'Open Banking',
            // 기타 분류
            'Funding', 'M&A', 'WealthTech', 'InsurTech'
        ];

        let cluster = 'Global FinTech Trends';
        const titleAndDesc = (item.title + ' ' + item.description).toLowerCase();

        for (const term of keyTerms) {
            if (titleAndDesc.includes(term.toLowerCase())) {
                cluster = term;
                break;
            }
        }

        if (!clusters.has(cluster)) {
            clusters.set(cluster, []);
        }
        clusters.get(cluster)!.push(item);
    }

    // 크기순 및 중요 키워드 우선 정렬
    return Array.from(clusters.values())
        .sort((a, b) => b.length - a.length);
}

// 클러스터에서 이슈 생성
async function generateIssueFromCluster(
    model: ReturnType<typeof genAI.getGenerativeModel>,
    cluster: NewsItem[]
): Promise<IssueItem | null> {
    const primaryNews = cluster[0];
    const frameworks = matchFrameworks(primaryNews.title, primaryNews.description);

    // 뉴스 리스트에 인덱스 부여
    const indexedNews = cluster.map((n, i) => `[${i + 1}] 제목: ${n.title}\n출처: ${n.url}`).join('\n\n');

    const prompt = `You are a **North American & Global Fintech Strategic Analyst**. 

## News Cluster Information (Indexed)
${indexedNews}

## Applied Analysis Frameworks
${frameworks.map(f => `- ${f.name}: ${f.insightTemplate}`).join('\n')}

## Output Format (JSON)
{
  "headline": "English headline (under 50 characters, focused on a single core topic)",
  "category": "Appropriate category (English)",
  "oneLineSummary": "A single sentence summarizing the entire issue (under 150 characters)",
  "hashtags": ["#Keyword1", "#Keyword2", "#Keyword3"],
  "keyFacts": [
    "Key fact 1 (Include specific numbers/company names)",
    "Key fact 2",
    "Key fact 3"
  ],
  "insight": "By synthesizing the above 3 key facts, derive deep insights on the ripple effects and strategic implications for the North American & Global Fintech ecosystem, tailored to the applied analysis framework (around 300 characters)",
  "relevantSourceIndices": [1, 2]
}

## Writing Rules
- Write 100% in **English**.
- **All output content (headline, category, oneLineSummary, keyFacts, insight, etc.) MUST be written in a concise, bullet-point style.** Avoid long, wordy paragraphs. Get straight to the point.
- **Strictly Single Topic**: A single brief card must deal with only one specific and clear topic. Do not list multiple different news items in parallel.
- **IMPORTANT**: The \`relevantSourceIndices\` field must contain an array of integers representing ONLY the core article numbers directly related to this briefing.
  - Key Facts: You must extract **exactly 3 key facts** and put them in the \`keyFacts\` array. Select only the 3 most important facts so that 4 or more are not mixed.
  - Deep Insight:
    - This is not a simple summary. Thoroughly analyze what opportunities or threats the extracted 3 facts pose to the **Global Fintech Industry and Legacy Banks** ecosystem **strictly from the perspective of the selected analysis framework**.
    - Narrate from an expert's perspective, connecting market landscape changes, technological leadership, and regulatory risks.
- Base narration on objective figures and official statements (must include numerical data if available).
- Exclude emotional expressions (maintain a dry and professional tone).

Output ONLY pure JSON.`;

    try {
        const result = await generateWithRetry(model, prompt);
        const response = await result.response;
        const text = response.text();

        // JSON 추출
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('JSON not found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // 1차 필터링: Gemini가 선택한 인덱스 사용
        let selectedSources: string[] = [];
        if (parsed.relevantSourceIndices && Array.isArray(parsed.relevantSourceIndices)) {
            selectedSources = parsed.relevantSourceIndices
                .map((idx: number) => cluster[idx - 1]?.url)
                .filter((url: string) => url !== undefined);
        }

        // 2차 필터링 (강제): 헤드라인 키워드 기반 코드 레벨 검증
        const headline = parsed.headline || parsed.title || '';
        const headlineKeywords = headline.split(' ').filter((w: string) => w.length > 1);

        const finalSources = (selectedSources.length > 0 ? selectedSources : cluster.map(c => c.url))
            .filter((url, index) => {
                const newsItem = cluster.find(c => c.url === url);
                if (!newsItem) return false;

                const content = (newsItem.title + ' ' + (newsItem.description || '')).toLowerCase();
                const score = headlineKeywords.reduce((acc: number, kw: string) => {
                    return acc + (content.includes(kw.toLowerCase()) ? 1 : 0);
                }, 0);

                return index === 0 || score > 0;
            });

        return {
            headline: parsed.headline || parsed.title,
            category: parsed.category,
            oneLineSummary: parsed.oneLineSummary,
            hashtags: parsed.hashtags,
            keyFacts: parsed.keyFacts,
            insight: parsed.insight || parsed.strategicInsight,
            framework: getFrameworkNames(frameworks),
            sources: finalSources.length > 0 ? finalSources : [cluster[0].url],
        };
    } catch (error) {
        console.error('[Issue Generation Error]', error);
        return null;
    }
}

// 중복 이슈 체크 로직
export async function checkDuplicateIssues(newIssue: IssueItem, history: IssueItem[]): Promise<boolean> {
    if (history.length === 0) return false;

    // 1. 소스 URL 중복 체크 (가장 확실함)
    // 새로운 이슈의 소스가 기존 이슈의 소스와 50% 이상 겹치면 중복
    const newSources = new Set(newIssue.sources || []);

    for (const oldIssue of history) {
        const oldSources = new Set(oldIssue.sources || []);
        if (newSources.size === 0 || oldSources.size === 0) continue;

        const intersection = [...newSources].filter(x => oldSources.has(x));
        const overlapRatio = intersection.length / Math.min(newSources.size, oldSources.size);

        if (overlapRatio >= 0.5) {
            console.log(`[Deduplication] Source overlap ${Math.round(overlapRatio * 100)}% with "${oldIssue.headline}"`);
            return true;
        }

        // 2. 헤드라인 유사도 체크 (Jaccard Similarity of keywords)
        const sim = calculateSimilarity(newIssue.headline, oldIssue.headline);
        if (sim > 0.7) {
            console.log(`[Deduplication] Headline similarity ${sim.toFixed(2)} with "${oldIssue.headline}"`);
            return true;
        }

        // 3. AI Semantic Check (Fallback for semantic duplicates)
        // 키워드 유사도가 낮아도(0.2~0.7) 의미적으로 동일할 수 있음 (예: "Stock Hits High" vs "Shares Record")
        if (sim > 0.2) {
            const isSemanticDupe = await checkSemanticDuplicate(newIssue, oldIssue);
            if (isSemanticDupe) return true;
        }
    }
    return false;
}

// 3. AI 기반 의미론적 유사도 체크 (키워드 매칭이 애매한 경우)
async function checkSemanticDuplicate(newIssue: IssueItem, oldIssue: IssueItem): Promise<boolean> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
        const prompt = `
        Compare these two news issues and determine if they describe the exact same core event or announcement. 
        Ignore minor differences in details or perspective.

        Issue A: "${newIssue.headline}"
        Key Facts A: ${newIssue.keyFacts.join(', ')}
        
        Issue B: "${oldIssue.headline}"
        Key Facts B: ${oldIssue.keyFacts.join(', ')}
        
        Are they referring to the same event? Answer strictly with "YES" or "NO".
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().toUpperCase();

        if (text.includes("YES")) {
            console.log(`[Deduplication] AI Semantic Match: "${newIssue.headline}" == "${oldIssue.headline}"`);
            return true;
        }
        return false;
    } catch (e) {
        console.error("Semantic check failed", e);
        return false;
    }
}

// 간단한 키워드 기반 유사도 (Jaccard Similarity)
export function calculateSimilarity(str1: string, str2: string): number {
    const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s가-힣]/g, '').split(/\s+/).filter(w => w.length > 1);
    const set1 = new Set(normalize(str1));
    const set2 = new Set(normalize(str2));

    if (set1.size === 0 || set2.size === 0) return 0;

    const intersection = [...set1].filter(x => set2.has(x));
    return intersection.length / (set1.size + set2.size - intersection.length); // Jaccard Index
}

// API 연결 테스트 function
export async function checkGeminiConnection(): Promise<boolean> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
        const result = await model.generateContent('Hello');
        const response = await result.response;
        console.log('[Gemini Connection Test Success]:', response.text().slice(0, 20) + '...');
        return true;
    } catch (error) {
        console.error('[Gemini Connection Test Failed]', error);
        return false;
    }
}

// API 연결 테스트
export async function testGeminiConnection(): Promise<boolean> {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
        const result = await model.generateContent('Hello');
        const response = await result.response;
        return !!response.text();
    } catch (error) {
        console.error('[Gemini Connection Test Failed]', error);
        return false;
    }
}

// 트렌드 센싱 리포트 (Deep Dive) 생성
export async function generateTrendReport(
    issue: IssueItem,
    context: string // Kept for compatibility
): Promise<string | null> {
    // Upgraded System Prompt: Super Finance Expert Edition
    const systemPrompt = `# Antigravity Prompt — FinTech In-Depth Strategic Report (Super Finance Expert Edition)

## Role
You are a 20-year veteran **'North American & Global Fintech Strategic Consultant'** and **'Industry Analysis Expert'**.
Starting from the provided brief issue, your core mission is to write a **'Deep Dive'** report that thoroughly investigates structural changes and ripple effects.
Inherit 100% of the brief's context, but expand the depth and scope of information through search ("googleSearch") to present strategic actions for decision-makers.

## Critical Process: Triple-Search Heuristics
**Before writing, you MUST execute search ("googleSearch") with the following 3 intentions:**
1. **[Fact Check & Expansion]**: Update the brief contents with the latest data, and secure specific specs, launch dates, and market data.
2. **[Anti-Thesis Search]**: Search for counter-arguments, technical limitations, and skeptical views of this issue to secure a balanced analysis.
3. **[Value Chain Impact]**: Search for the ripple effects this issue has across upstream (research/academia) → midstream (platform/infrastructure) → downstream (SaaS/end users).
4. **All Outputs in English**: Write the entire report strictly in English.

## Core Rules
1) **No Mock Data**: Vague expressions like "to be announced later" or "various companies" are strictly prohibited. Use real names, specific numbers ($, %, dates), and official statements only.
2) **Source Extension**: ISSUE_URLS are just the starting point. Add at least 3 new high-quality global sources to ensure analytical objectivity.
3) **Professional Tone**: **Write all sentences concisely using a professional, bullet-point style.** Strictly forbid long, wordy paragraphs. Actively use sub-bullets (-) to be brief and professional.
4) **Label Precision**: NEVER change or abbreviate the labels inside the brackets [ ] in the Output Format below. Output them exactly as they are.
5) **No Empty Sections**: Every ## ■ section MUST contain substantial content. Empty sections are strictly prohibited.
6) **Expert Analytical Basis**: After the [Analysis] tag, you MUST use 2~3 sub-bullets (-) to provide an in-depth analysis, and specify the \`(Basis: application of proven management/economic frameworks like disruptive innovation, switching costs, network effects, economies of scale, etc.)\` at the end. DO NOT use placeholders like "(Based on structural analysis)".

## Output Format
Strictly adhere to the exact format below. All content must be in English.
The instructions inside the angle brackets < > indicate what content you need to fill in.
Keep the labels inside the brackets [ ] exactly as they are.

# In-Depth Brief Report: <A title penetrating the issue>

Subject: <Specific target (Company name, tech name, etc.)>
Target: CEO/CTO, Head of Strategic Planning
Period: 6~12 months outlook as of <Analysis baseline date>
Perspective: <Choose 1 out of Technology / Market / Geopolitics>

## ■ Executive Summary
- **[Signal]** <The core signal sent by this issue — include specific data>
- **[Change]** <The industrial landscape altered by this>
- **[So What]** <Implications and actionable recommendations that global enterprises should note immediately>

## ■ Key Developments (Deep Dive)
### <Specific Event/Announcement Name 1>
- [Fact] <Specific facts found through search (Numbers, dates, company names are mandatory)>
- [Analysis] <Bullet-point analysis of this event's impact on the industry structure using 2~3 sub-bullets> (Basis: <ex. Analysis of delayed entrant barriers weakening due to disruptive innovation models>)

### <Specific Event/Announcement Name 2>
- [Fact] <Specific facts found through search>
- [Analysis] <Bullet-point analysis using 2~3 sub-bullets> (Basis: <ex. Analysis of monopoly share strengthening due to network effects>)

## ■ Core Themes
### <Theme Name>
- **[Driver]** <The core driver leading this theme>
- **[Context]** <Background explanation and related corporate trends>

## ■ Implications
- [Market] <Market size, CapEx, business model impact — include figures>
- [Tech] <Technological breakthroughs or bottlenecks>
- [Comp] <Response status of competitors (Stripe, PayPal, Plaid, Block, etc.)>
- [Policy] <Related regulations, legal risks, policy trends>

## ■ Risks & Uncertainties
- **[TECH]** <Technological Risk>
  - Impact: <Expected negative impact>
- **[MARKET]** <Market Risk>
  - Impact: <Expected negative impact>

## ■ Watchlist
- **<Indicator/Event Name 1>**
  (Why) <Why this is an important leading trigger>
  (How) <What and how to monitor>
- **<Indicator/Event Name 2>**
  (Why) <Explanation>
  (How) <Monitoring method>

## ■ Sources
(The system will inject this automatically)

## START
Start searching immediately and write the report based on facts. Don't imagine; search.`;

    const model = genAI.getGenerativeModel({
        model: 'gemini-3-pro-preview',
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} } as any],
    });

    const nowDate = new Date();
    const estDateStr = nowDate.toLocaleString('en-US', { timeZone: 'America/New_York' });

    const userPrompt = `
# INPUTS
- ISSUE_TITLE: ${issue.headline}
- ISSUE_BULLETS: ${issue.keyFacts.join(', ')}
- ISSUE_URLS:
${issue.sources ? issue.sources.join('\\n') : 'URL 없음'}
- TODAY_KST: ${estDateStr}`;

    try {
        console.log('[Trend API] 상세 리포트 생성 시작 (Pro 모델 / 소스 확장 로직)...');
        const result = await generateWithRetry(model, userPrompt);
        const response = await result.response;
        let text = response.text();

        // 소스 일관성 및 강화 로직
        const briefingSources = issue.sources || [];
        const additionalSources: string[] = [];

        // Grounding Metadata에서 신규 소스 추출
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata?.groundingChunks) {
            groundingMetadata.groundingChunks.forEach((chunk: any) => {
                if (chunk.web?.url) {
                    const url = chunk.web.url;
                    if (!briefingSources.includes(url)) {
                        additionalSources.push(url);
                    }
                }
            });
        }

        // 최종 소스 결합
        const combinedSourcesSet = new Set([...briefingSources, ...additionalSources]);
        const finalUniqueSources = Array.from(combinedSourcesSet);

        // 소스 섹션 렌더링
        let newSourcesSection = '\n## ■ Sources\n';
        finalUniqueSources.forEach((url, idx) => {
            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname.replace('www.', '');
                const label = briefingSources.includes(url) ? 'Brief Origin' : 'Deep Research';
                newSourcesSection += `- [${idx + 1}] ${hostname} | ${estDateStr.split(' ')[0]} | [${label}] ${url}\n`;
            } catch (e) {
                newSourcesSection += `- [${idx + 1}] Source | ${estDateStr.split(' ')[0]} | ${url}\n`;
            }
        });

        const expansionCount = finalUniqueSources.length - briefingSources.length;
        newSourcesSection += expansionCount > 0
            ? `\n(브리프 소스 ${briefingSources.length}개를 모두 상속하였으며, 추가 연구를 통해 ${expansionCount}개의 신규 출처를 확보했습니다.)\n`
            : `\n(브리프 작성에 사용된 모든 원본 소스 ${briefingSources.length}개를 기반으로 작성되었습니다.)\n`;

        const sourcesPattern = /(?:##?\s*)?■\s*Sources[\s\S]*$/i;
        const bodyContent = text.replace(sourcesPattern, '').trim();

        const finalReport = `${bodyContent}\n\n${newSourcesSection}`;

        console.log(`[Trend API] 소스 검증 완료: 브리프(${briefingSources.length}) -> 리포트(${finalUniqueSources.length})`);

        return finalReport;
    } catch (error) {
        console.error('[Trend Report Error]', error);
        return null;
    }
}

// Helper: Retry logic for API calls
async function generateWithRetry(model: any, prompt: string | any, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await model.generateContent(prompt);
        } catch (error: any) {
            const isOverloaded = error.status === 503 || error.message?.includes('overloaded');
            const isRateLimit = error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED');

            if ((isOverloaded || isRateLimit) && i < retries - 1) {
                console.warn(`[Gemini Retry] Attempt ${i + 1} failed. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                continue;
            }
            throw error;
        }
    }
}
