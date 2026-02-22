import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { IssueItem } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ─── Types ───────────────────────────────────────────────────────────────────
export interface IssueCluster {
    clusterName: string;
    themeDescription: string;
    issueIndices: number[];
}

// ─── 1. AI-Driven Issue Clustering ──────────────────────────────────────────
export async function clusterIssuesByAI(issues: IssueItem[], domain: 'ai' | 'battery' = 'ai'): Promise<IssueCluster[]> {
    if (issues.length === 0) return [];

    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const issueList = issues.map((issue, idx) =>
        `[${idx}] ${issue.headline}\n    Facts: ${issue.keyFacts.slice(0, 2).join(' | ')}`
    ).join('\n');

    const domainExpert = domain === 'ai' ? 'North American & Global Fintech Strategic Analyst' : 'Global Battery Industry Strategic Analyst';
    const focusItems = domain === 'ai'
        ? 'Payment innovation, embedded finance, virtual asset regulation, B2B/B2C fintech competitive landscape'
        : 'Supply chain (Up/Mid/Downstream), Tech Roadmap (LFP/Solid-state, etc.), OEM cooperation, Policy (IRA, etc.)';

    const prompt = `You are a ${domainExpert}.
Analyze the following ${issues.length} news issues and **group highly related issues into clusters**.
During analysis, pay special attention to the **[${focusItems}]** perspective.

## Rules
1. Each cluster must include at least 2 issues.
2. Independent issues (that do not belong to any active cluster) should be grouped into an "Other Key Trends" cluster.
3. Create up to 5 clusters at most.
4. All issues MUST belong to at least one cluster.
5. Output ONLY JSON.

## Issues
${issueList}

## Output JSON Schema
\`\`\`json
{
  "clusters": [
    {
      "clusterName": "Theme name penetrating the cluster (English, under 30 characters)",
      "themeDescription": "One-sentence explanation of the core theme of this cluster (English)",
      "issueIndices": [0, 2, 5]
    }
  ]
}
\`\`\`

Output ONLY JSON.`;

    try {
        const result = await generateWithRetry(model, prompt);
        const response = result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Clustering JSON not found');

        const parsed = JSON.parse(jsonMatch[0]);
        const clusters: IssueCluster[] = parsed.clusters || [];

        // Validation: ensure all indices are within bounds
        return clusters.map(c => ({
            ...c,
            issueIndices: c.issueIndices.filter(i => i >= 0 && i < issues.length),
        })).filter(c => c.issueIndices.length >= 1);

    } catch (error) {
        console.error('[Weekly Report] Clustering failed:', error);
        // Fallback: single cluster with all issues
        return [{
            clusterName: 'Weekly Comprehensive Trends',
            themeDescription: 'Comprehensive analysis of key trends over the last 7 days',
            issueIndices: issues.map((_, i) => i),
        }];
    }
}

// ─── 2. Weekly Report Generation ────────────────────────────────────────────
export async function generateWeeklyReport(
    clusters: IssueCluster[],
    allIssues: IssueItem[],
    domain: 'ai' | 'battery' = 'ai'
): Promise<string | null> {

    const domainLabel = domain === 'ai' ? 'North American & Global Fintech Industry' : 'Global Battery Industry';
    const nowDate = new Date();
    const estDateStr = nowDate.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const weekAgo = new Date(nowDate);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const periodLabel = `${weekAgo.toLocaleDateString('en-US')} ~ ${nowDate.toLocaleDateString('en-US')}`;

    // Build cluster context
    const clusterContext = clusters.map((cluster, cIdx) => {
        const clusterIssues = cluster.issueIndices.map(i => allIssues[i]).filter(Boolean);
        const issueDetails = clusterIssues.map((issue, iIdx) => `
      [Issue ${iIdx + 1}] ${issue.headline}
      - Key Facts: ${issue.keyFacts.join(' / ')}
      - Insight: ${issue.insight}
      - Sources: ${issue.sources?.join(', ') || 'None'}`).join('\n');

        return `
### Cluster ${cIdx + 1}: ${cluster.clusterName}
Theme: ${cluster.themeDescription}
Issues Included: ${clusterIssues.length}
${issueDetails}`;
    }).join('\n\n---\n');

    const aiRole = {
        title: 'Global Fintech Industry Strategic Consultant',
        reasoning: `
- **Value Chain Evolution**: Analyze value chain dynamics, specifically how technology integrates with or disrupts Legacy Banks.
- **Regulatory Arbitrage & Compliance**: Capture the economic ripple effects of each country's regulatory framework on capital movement and business models.
- **Business Model Pivot**: Rather than simply listing trends, explain the disruptive business opportunities and network effects brought by B2B/B2C fintech innovation.`
    };

    const batteryRole = {
        title: 'Global Battery/Energy Industry Chief Strategist',
        reasoning: `
- **Value Chain Integration**: Analyze bottlenecks across the entire value chain, from mineral supply to precursors, cathodes, cell manufacturing, and OEM integration.
- **Geopolitical Arb**: Calculate the actual impact of policy subsidies and trade barriers (IRA, CRMA, etc.) on production bases and profitability.
- **Tech Roadmap Competition**: Analyze technological competitive advantages, such as NCM vs. LFP market share changes, the introduction of 4680 cylindrical form factors, and the actual mass production timing of the solid-state camp.`
    };

    const expert = domain === 'ai' ? aiRole : batteryRole;

    // Upgraded System Prompt: Expert Weekly Insight Edition (v2)
    const systemPrompt = `# Antigravity Prompt — Expert Weekly Insight Strategic Report

## Role
You are a 20-year veteran '${expert.title}' and a 'Data Scientist'.
Your core mission is not to look at individual issues fragmentally, but to find **'Structural Linkages'** and predict the massive industrial flow.

## Critical Process: Triple-Search Heuristics (Weekly Edition)
**Before writing, you MUST execute search ("googleSearch") with the following 3 intentions:**
1. **[Synthesis Search]**: Find common denominators or conflicts among the clustered issues of the week.
2. **[Paradigm Validation]**: Find data and expert contributions that support whether the currently observed change is temporary noise or a 'structural inflection point' where the industrial paradigm shifts.
3. **[Forward-Looking Scenarios]**: Use queries like '6-month Outlook', 'Industry Forecast 2026', and 'Strategic Roadmap' to materialize future scenarios.
4. **All Outputs in English**: Write the entire report strictly in English.

## Strategic Reasoning Chain
Before writing the report, you MUST go through the following logical development.
${expert.reasoning}
- **Second-Order Consequences**: What is the chain reaction this week's trend will have on the related ecosystem 6 months from now?
- **Decision Matrix**: How should readers change resource allocation based on this data?

## Core Rules
1) **No Mock Data**: Quantitative data (%, $, order amount, CapEx) MUST be included. Vague expressions are strictly prohibited.
2) **Strategic Coherence**: Ensure the entire report points to a single consistent message. Narratives like "there were many such events recently" are prohibited; instead, present insights like "these flows are converging in a single direction."
3) **Source Extension**: Secure analytical objectivity by adding at least 3~5 new high-quality global sources in addition to the existing brief sources.
4) **Label Precision**: NEVER change or abbreviate the labels inside the brackets [ ] in the Output Format below. Do not abbreviate [Top Strategic Signal] into [Signal]. Output them exactly as they are.
5) **No Empty Sections**: Every ## ■ section MUST contain substantial content. Empty sections are strictly prohibited.
6) **Expert Analytical Basis**: After the [Strategic Analysis] tag, you MUST use 2~3 sub-bullets (-) to provide an in-depth analysis, and specify the \`(Basis: application of proven management/economic frameworks like disruptive innovation, switching costs, network effects, economies of scale, etc.)\` at the end. DO NOT use placeholders like "(Based on structural analysis)".
7) **Professional Tone**: **Write all output text concisely using a professional, bullet-point style.** Strictly forbid long, wordy paragraphs. Actively use sub-bullets (-) to be brief. 

## Output Format
Strictly adhere to the exact format below. All content must be in English.
The instructions inside the angle brackets < > indicate what content you need to fill in. The < > symbols themselves are not included in the final output.
Keep the labels inside the brackets [ ] exactly as they are.

# [Weekly Strategic Report] <One-line core structural theme penetrating the clusters>

Subject: ${domainLabel}
Target: CTO/CSO, Head of Strategic Planning, Investment Decision Makers
Period: ${periodLabel}
Synthesis Analysis: Convergence analysis of ${clusters.length} core themes, ${allIssues.length} issues

## ■ Executive Summary
- **[Top Strategic Signal]** <The single most disruptive signal observed this week — include specific figures>
- **[Converged Mega Trend]** <The massive industrial stream that all clusters commonly point to>
- **[Strategic Recommendation]** <Immediate actionable recommendations for decision-makers>

## ■ Structural Cluster Analysis
<Repeat the format below for each cluster>

### 🔹 <Cluster Name>
**Core Strategic Value**: <1-line meaning this cluster gives to future competitiveness>

    #### Key Developments & Context
    - **[Fact]** <Fact found — Numbers, dates, company names are mandatory>
    - **[Strategic Analysis]** <Bullet-point analysis of this development's impact on industry structure using 2~3 sub-bullets> (Basis: <ex. Analysis of delayed entrant barriers weakening due to disruptive innovation models>)
    - **[Structural Linkage]** <Organic relationship and synergy/conflict analysis with other cluster issues>

## ■ Second-Order Economic Insights
### <Title of Visualizing Industrial Change>
- **[Primary Driver]** <Core driver inducing the change — include specific data>
- **[Ripple Effects]** <Detailed description of chain ripple effects on forward/backward industries>

## ■ Professional Implications
- **[Market & CapEx]** <Market size and changes in corporate capital investment direction — include figures>
- **[Technology Frontier]** <Tech bottlenecks and trends of innovators trying to break through them>
- **[Competitive Edge]** <Core competitive factors dividing winners and losers in this flow>
- **[Policy & Regulation]** <Substantial impact of changes in major countries' policy and regulatory environments on the industry>

## ■ Risks & Uncertainties
- **[TECH]** <Technological Risk>
  - Impact: <Expected negative impact>
- **[MARKET]** <Market/Macroeconomic Risk>
  - Impact: <Expected negative impact>
- **[REGULATION]** <Regulatory/Policy Risk>
  - Impact: <Expected negative impact>

## ■ Strategic Watchlist: Indicators to Monitor
- **<Core Leading Indicator 1>**
  (Why) <Why this is an Inflection Point trigger>
  (Threshold) <At what figure/change phase is strategic pivoting required>
- **<Core Leading Indicator 2>**
  (Why) <Explanation>
  (Threshold) <Pivoting criterion>

## ■ Sources
(The system will inject this automatically)

## START
Start the super-gap weekly strategic analysis immediately. Searching and connecting are key.`;

    const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-pro-preview',
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} } as any],
    });

    const userPrompt = `
# Weekly Report Generation Request

## Analysis Period: ${periodLabel}
## Total Issues: ${allIssues.length} issues
## Number of Clusters: ${clusters.length} clusters

---
## Issue Data by Cluster

${clusterContext}

---
## TODAY_KST: ${estDateStr}

Write a comprehensive weekly deep-dive report based on the cluster data above.
You MUST execute search (googleSearch) first before writing.`;

    try {
        console.log(`[Weekly Report] 주간 리포트 생성 시작(${clusters.length} clusters, ${allIssues.length} issues)...`);

        let result;
        let isFallback = false;

        try {
            // 1. Primary Attempt: Pro Model with Retry
            result = await generateWithRetry(model, userPrompt, 2, 3000);
        } catch (primaryError: any) {
            console.warn('[Weekly Report] Primary Pro Model failed, trying Fallback Flash Model...', primaryError.message);
            // 2. Fallback Attempt: Flash Model (Faster, more available)
            const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
            result = await generateWithRetry(fallbackModel, userPrompt, 2, 2000);
            isFallback = true;
        }

        const response = result.response;
        let text = response.text();

        if (isFallback) {
            text = `> [!NOTE]\n> 현재 서비스 부하로 인해 AI 모델이 일시적으로 변경되었습니다. 분석의 깊이가 다소 차이날 수 있습니다.\n\n${text}`;
        }

        // Extract new sources from grounding metadata
        const briefingSources = allIssues.flatMap(i => i.sources || []);
        const additionalSources: string[] = [];

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

        // Build final sources section
        const combinedSourcesSet = new Set([...briefingSources, ...additionalSources]);
        const finalUniqueSources = Array.from(combinedSourcesSet);

        let newSourcesSection = '\n## ■ Sources\n';
        finalUniqueSources.forEach((url, idx) => {
            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname.replace('www.', '');
                const label = briefingSources.includes(url) ? 'Brief Origin' : 'Deep Research';
                newSourcesSection += `- [${idx + 1}] ${hostname} | [${label}] ${url}\n`;
            } catch (e) {
                newSourcesSection += `- [${idx + 1}] Source | ${url}\n`;
            }
        });

        const expansionCount = finalUniqueSources.length - new Set(briefingSources).size;
        newSourcesSection += expansionCount > 0
            ? `\n(브리프 원본 소스 ${new Set(briefingSources).size}개를 기반으로, 추가 리서치를 통해 ${expansionCount}개의 신규 출처를 확보했습니다.)\n`
            : `\n(브리프 원본 소스를 기반으로 작성되었습니다.)\n`;

        const sourcesPattern = /## ■ Sources[\s\S]*$/i;
        const bodyContent = text.replace(sourcesPattern, '').trim();
        const finalReport = `${bodyContent}\n\n${newSourcesSection}`;

        console.log(`[Weekly Report] 생성 완료. Sources: brief(${new Set(briefingSources).size}) + new (${expansionCount})`);
        return finalReport;

    } catch (error) {
        console.error('[Weekly Report] Generation failed after all attempts:', error);
        return null;
    }
}

// ─── Helper: Retry logic ───────────────────────────────────────────────────
async function generateWithRetry(model: GenerativeModel, prompt: string | any, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await model.generateContent(prompt);
        } catch (error: any) {
            const isOverloaded = error.status === 503 || error.message?.includes('overloaded') || error.message?.includes('high demand');
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
    throw new Error('Retry attempts exhausted');
}
