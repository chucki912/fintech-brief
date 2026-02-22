import { AnalysisFramework } from '@/types';

// Core Analysis Frameworks (Fintech)
export const ANALYSIS_FRAMEWORKS: Record<string, AnalysisFramework> = {
    embedded_finance: {
        name: "Embedded Finance & BaaS",
        triggers: ["BaaS", "embedded finance", "임베디드 금융", "비금융권 금융", "api", "open banking", "오픈 뱅킹"],
        insightTemplate: "Implications of non-financial platforms internalizing finance and the defense mechanisms of legacy financial institutions"
    },

    blockchain_crypto: {
        name: "Decentralization & Digital Assets",
        triggers: ["crypto", "bitcoin", "blockchain", "defi", "stablecoin", "cbdc", "tokenization", "가상자산", "토큰화", "디파이", "스테이블코인"],
        insightTemplate: "The ripple effect of global digital currency hegemony and asset tokenization on mainstream financial markets"
    },

    unbundling_to_rebundling: {
        name: "Structural Shift from Unbundling to Rebundling",
        triggers: ["super app", "슈퍼앱", "ecosystem", "생태계", "consolidation", "M&A", "인수합병", "cross-selling", "크로스셀링"],
        insightTemplate: "Analysis of the super-app strategy of fintech companies and customer lock-in effects through the rebundling of financial services"
    },

    payment_network_innovation: {
        name: "Borderless Payment & Remittance Networks",
        triggers: ["cross-border", "결제", "송금", "payments", "remittance", "fednow", "real-time", "실시간 결제", "swift"],
        insightTemplate: "Reduction of intermediary costs due to the establishment of borderless real-time payment networks and the potential collapse of existing payment networks"
    },

    regulation_compliance: {
        name: "Regulatory & Compliance Arbitrage",
        triggers: ["regulation", "compliance", "regtech", "kyc", "aml", "규제", "라이선스", "basel", "금융당국", "sec"],
        insightTemplate: "Implications of global fintech capital flight/inflow due to the introduction of financial regulatory sandboxes and regulations in various countries"
    },

    alternative_data_lending: {
        name: "Alternative Data-Based Credit & Lending",
        triggers: ["bnpl", "lending", "credit", "대출", "신용평가", "underwriting", "데이터", "alternative data", "대안 데이터"],
        insightTemplate: "Data capitalism overcoming the limitations of existing credit scoring models and subsequent changes in risk tranches"
    },

    wealth_democratization: {
        name: "Wealth Democratization",
        triggers: ["wealthtech", "robinhood", "retail investor", "개인 투자자", "robo-advisor", "로보어드바이저", "fractional", "조각투자"],
        insightTemplate: "The threat posed by the expansion of retail investors' market accessibility to capital market volatility and traditional WM (Wealth Management) business models"
    }
};

// 뉴스에 가장 적합한 프레임워크 1-2개 선택
export function matchFrameworks(title: string, description: string): AnalysisFramework[] {
    const text = `${title} ${description}`.toLowerCase();
    const matches: { framework: AnalysisFramework; score: number }[] = [];

    for (const [key, framework] of Object.entries(ANALYSIS_FRAMEWORKS)) {
        let score = 0;

        for (const trigger of framework.triggers) {
            if (text.includes(trigger.toLowerCase())) {
                score += 1;
            }
        }

        if (score > 0) {
            matches.push({ framework, score });
        }
    }

    // 점수 높은 순으로 정렬 후 상위 2개 반환
    matches.sort((a, b) => b.score - a.score);

    // 매칭되는 게 없으면 기본 프레임워크 반환
    if (matches.length === 0) {
        return [ANALYSIS_FRAMEWORKS.embedded_finance]; // Fintech의 기본은 임베디드 금융/구조 변화로 설정
    }

    return matches.slice(0, 2).map(m => m.framework);
}

// 프레임워크 이름 목록 반환
export function getFrameworkNames(frameworks: AnalysisFramework[]): string {
    return frameworks.map(f => f.name).join(', ');
}
