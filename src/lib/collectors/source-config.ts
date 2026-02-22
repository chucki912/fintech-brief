// 검색 키워드 설정
export const PRIMARY_KEYWORDS = [
    // 기업
    "Stripe", "Plaid", "Square", "Block", "PayPal",
    "Adyen", "Revolut", "Monzo", "NuBank", "Klarna", "Coinbase",
    "Robinhood", "SoFi", "Affirm", "Chime", "Brex", "Ramp",

    // 기술 및 섹터
    "Fintech", "Embedded Finance", "BaaS", "Open Banking", "DeFi",
    "Digital Banking", "Real-time payments", "FedNow", "CBDC",
    "Web3", "Blockchain", "Stablecoin", "Tokenization", "Crypto",

    // 비즈니스 모델
    "BNPL", "Neobank", "WealthTech", "InsurTech", "RegTech", "PropTech",

    // 규제 및 동향
    "MICA", "Basel III", "Crypto regulation", "Open Finance", "Financial inclusion"
];

// 카테고리별 키워드
export const TOPIC_CATEGORIES: Record<string, string[]> = {
    "Payments & Transfers": ["payments", "remittance", "cross-border", "FedNow", "real-time payments", "Stripe", "Adyen", "PayPal"],
    "Digital Banking & BaaS": ["neobank", "digital bank", "BaaS", "embedded finance", "open banking", "Chime", "Revolut", "Monzo"],
    "Lending & BNPL": ["BNPL", "lending", "credit", "Affirm", "Klarna", "mortgage", "underwriting"],
    "Crypto & Blockchain": ["crypto", "bitcoin", "blockchain", "DeFi", "stablecoin", "CBDC", "tokenization", "Coinbase"],
    "WealthTech & Trading": ["wealthtech", "robot-advisor", "trading", "brokerage", "Robinhood", "retail investor"],
    "RegTech & Security": ["regtech", "compliance", "KYC", "AML", "fraud", "identity", "cybersecurity"]
};

// 뉴스 소스 RSS 피드 - 우선순위별 (Fintech 집중)
export const RSS_FEEDS = {
    TIER_1: [
        { name: "Finextra", url: "https://www.finextra.com/rss/headlines.aspx" },
        { name: "TechCrunch Fintech", url: "https://techcrunch.com/category/fintech/feed/" },
        { name: "Sifted Fintech", url: "https://sifted.eu/sector/fintech/feed" },
    ],
    TIER_2: [
        { name: "Fintech Futures", url: "https://www.fintechfutures.com/feed/" },
        { name: "PYMNTS", url: "https://www.pymnts.com/feed/" },
        { name: "The Block", url: "https://www.theblock.co/rss.xml" }, // Crypto/Fintech
        { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
    ],
    TIER_3: [
        // 기타 서브 소스들
    ]
};

// Google News RSS 검색 URL 생성
export function getGoogleNewsRssUrl(query: string): string {
    // when:1d 파라미터를 추가하여 24시간 이내 뉴스만 검색
    const encodedQuery = encodeURIComponent(query + ' when:1d');
    return `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
}

// 제외 규칙
export const EXCLUDE_RULES = {
    excludeKeywords: ["LG AI연구원", "LG CNS", "LG전자 AI", "단순 앱 업데이트", "sponsored", "advertisement"], // 필요시 핀테크에 맞게 수정 가능
    excludePatterns: [
        /단순 앱 업데이트/,
        /sponsored/i,
        /advertisement/i,
    ],
    // 24시간 이내 뉴스만
    maxAgeHours: 24
};

// 소스 도메인 우선순위 점수
export const SOURCE_PRIORITY: Record<string, number> = {
    "finextra.com": 100,
    "techcrunch.com": 95,
    "sifted.eu": 90,
    "pymnts.com": 90,
    "fintechfutures.com": 90,
    "theblock.co": 85,
    "coindesk.com": 85,
    "ft.com": 85, // Financial Times
    "wsj.com": 85,
    "bloomberg.com": 80,
    "theinformation.com": 80,
    "axios.com": 80,
    "reuters.com": 80,
    "stripe.com": 80,
    "plaid.com": 80,
};

// 소스 점수 가져오기
export function getSourceScore(url: string): number {
    for (const [domain, score] of Object.entries(SOURCE_PRIORITY)) {
        if (url.includes(domain)) {
            return score;
        }
    }
    return 50; // 기본 점수
}
