'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import IssueCard from '@/components/IssueCard';
import TrendReportModal from '@/components/TrendReportModal';
import ManualSourceInput from '@/components/ManualSourceInput';
import ArchiveListView from '@/components/ArchiveListView';
import { BriefReport, IssueItem } from '@/types';

interface BriefSummary {
    id: string;
    date: string;
    dayOfWeek: string;
    totalIssues: number;
    generatedAt: string;
    issues?: IssueItem[];
}

export default function ArchivePage() {
    const [briefs, setBriefs] = useState<BriefSummary[]>([]);
    const [selectedBrief, setSelectedBrief] = useState<BriefReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Selection Mode State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIssues, setSelectedIssues] = useState<IssueItem[]>([]);
    const [manualUrls, setManualUrls] = useState<string[]>(['']);
    const [manualTexts, setManualTexts] = useState<string[]>([]);

    // Trend Report State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportContent, setReportContent] = useState('');
    const [reportLoading, setReportLoading] = useState(false);
    const [selectedReportIssue, setSelectedReportIssue] = useState<IssueItem | undefined>(undefined);

    // Weekly Report Generation State
    const [weeklyJobId, setWeeklyJobId] = useState<string | null>(null);
    const [weeklyStatus, setWeeklyStatus] = useState<'collecting' | 'clustering' | 'generating' | 'completed' | 'failed' | null>(null);
    const [weeklyProgress, setWeeklyProgress] = useState(0);
    const [weeklyMessage, setWeeklyMessage] = useState('');
    const [showWeeklySection, setShowWeeklySection] = useState(false);

    // 브리핑 목록 로드
    useEffect(() => {
        async function loadBriefs() {
            try {
                setLoading(true);
                const query = viewMode === 'list' ? '?list=true&include_issues=true' : '?list=true';
                const res = await fetch(`/api/brief${query}`);
                const data = await res.json();

                if (data.success) {
                    setBriefs(data.data);
                }
            } catch (err) {
                console.error('Failed to load briefs:', err);
            } finally {
                setLoading(false);
            }
        }

        loadBriefs();
    }, [viewMode]);

    // 특정 날짜 브리핑 로드
    const loadBriefDetail = async (date: string) => {
        try {
            setLoadingDetail(true);
            const res = await fetch(`/api/brief?date=${date}`);
            const data = await res.json();

            if (data.success) {
                setSelectedBrief(data.data);
            }
        } catch (err) {
            console.error('Failed to load brief detail:', err);
        } finally {
            setLoadingDetail(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    // 브리핑 삭제
    const handleDelete = async (date: string) => {
        try {
            const res = await fetch(`/api/brief?date=${date}`, {
                method: 'DELETE',
            });
            const data = await res.json();

            if (data.success) {
                alert('Brief deleted.');
                setSelectedBrief(null);
                // 목록 갱신 reload
                const listRes = await fetch('/api/brief?list=true');
                const listData = await listRes.json();
                if (listData.success) {
                    setBriefs(listData.data);
                }
            } else {
                alert(data.error || 'Deletion failed');
            }
        } catch (err) {
            console.error('Failed to delete brief:', err);
            alert('Error during deletion');
        }
    };

    // 트렌드 리포트 생성 (Deep Dive)
    const handleDeepDive = async (issue: IssueItem) => {
        setIsReportModalOpen(true);
        setSelectedReportIssue(issue);
        setReportContent(''); // Reset previous report
        setReportLoading(true); // Signal to Modal to start generation
    };

    const toggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        setSelectedIssues([]);
        setManualUrls(['']);
        setManualTexts([]);
    };

    const toggleIssueSelection = (issue: IssueItem) => {
        if (selectedIssues.some(i => i.headline === issue.headline)) {
            setSelectedIssues(selectedIssues.filter(i => i.headline !== issue.headline));
        } else {
            setSelectedIssues([...selectedIssues, issue]);
        }
    };

    // 주간 리포트 생성 시작
    const handleGenerateWeeklyReport = async () => {
        try {
            setWeeklyStatus('collecting');
            setWeeklyProgress(5);
            setWeeklyMessage('Preparing to collect data...');
            setShowWeeklySection(true);

            const res = await fetch('/api/weekly-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: 'ai' })
            });
            const data = await res.json();

            if (data.success) {
                setWeeklyJobId(data.data.jobId);
            } else {
                throw new Error(data.error || 'Failed to request issue');
            }
        } catch (err: any) {
            console.error('Weekly report start failed:', err);
            setWeeklyStatus('failed');
            setWeeklyMessage(err.message || 'Failed to start weekly report generation');
        }
    };

    // 주간 리포트 상태 폴링
    useEffect(() => {
        if (!weeklyJobId || weeklyStatus === 'completed' || weeklyStatus === 'failed') return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/weekly-report/status?jobId=${weeklyJobId}`);
                const data = await res.json();

                if (data.success) {
                    const { status, progress, message, report, error } = data.data;
                    setWeeklyStatus(status);
                    setWeeklyProgress(progress);
                    setWeeklyMessage(message || '');

                    if (status === 'completed' && report) {
                        setReportContent(report);
                        setIsReportModalOpen(true);
                        setWeeklyJobId(null); // Stop polling
                        clearInterval(interval);
                    } else if (status === 'failed') {
                        setWeeklyMessage(error || 'Generation failed');
                        setWeeklyJobId(null);
                        clearInterval(interval);
                    }
                }
            } catch (err) {
                console.error('Status check failed:', err);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [weeklyJobId, weeklyStatus]);

    const handleGenerateAggregatedReport = async () => {
        const validUrls = manualUrls.filter(url => url.trim() !== '');
        const validTexts = manualTexts.filter(t => t.trim() !== '');

        if (selectedIssues.length === 0 && validUrls.length === 0 && validTexts.length === 0) {
            alert('Please select issues or add manual sources.');
            return;
        }

        setIsReportModalOpen(true);
        setReportLoading(true);
        setReportContent('');
        setSelectedReportIssue(undefined);

        try {
            const res = await fetch('/api/reports/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'CUSTOM',
                    selectionMethod: selectedIssues.length > 0 ? 'MANUAL_SELECTION' : 'MANUAL_ONLY',
                    selectedIssues: selectedIssues,
                    manualUrls: validUrls,
                    manualTexts: validTexts,
                })
            });

            if (!res.ok) throw new Error('Report generation failed');

            const data = await res.json();
            setReportContent(data.report);
        } catch (e) {
            console.error(e);
            alert('Failed to generate report');
            setIsReportModalOpen(false);
        } finally {
            setReportLoading(false);
        }
    };

    const addManualUrlField = () => setManualUrls([...manualUrls, '']);
    const updateManualUrl = (index: number, value: string) => {
        const newUrls = [...manualUrls];
        newUrls[index] = value;
        setManualUrls(newUrls);
    };

    return (
        <div className="container">
            {/* Header */}
            <header className="header">
                <Link href="/" className="logo">
                    💸 Fintech Daily Brief
                </Link>
                <nav className="nav">
                    <Link href="/" className="nav-link">
                        Today's Brief
                    </Link>
                    <ThemeToggle />
                </nav>
            </header>

            {/* Main Content */}
            <main>
                <div className="archive-header animate-in">
                    <h1 className="archive-title">
                        Knowledge <span className="highlight">Archive</span>
                    </h1>
                    <p className="archive-subtitle">
                        Check past intelligence reports and track industry trends.
                    </p>

                    {!selectedBrief && (
                        <div className="view-switcher-container animate-in">
                            <div className="view-switcher">
                                <button
                                    className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                    onClick={() => setViewMode('grid')}
                                >
                                    📅 Date View
                                </button>
                                <button
                                    className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                                    onClick={() => setViewMode('list')}
                                >
                                    📋 List View
                                </button>
                            </div>

                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="loading-container">
                        <div className="premium-spinner" />
                        <span className="loading-text">Loading archive...</span>
                    </div>
                ) : (
                    <>
                        {/* Action Toolbar - Persistent in Detail or List View Selection Mode */}
                        {(selectedBrief || (viewMode === 'list' && briefs.length > 0)) && (
                            <div className="selection-toolbar animate-in">

                                {isSelectionMode && selectedIssues.length > 0 && (
                                    <button
                                        className="generate-report-btn"
                                        onClick={handleGenerateAggregatedReport}
                                    >
                                        ✨ Generate Aggregated Report ({selectedIssues.length})
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Manual Source Input Section */}
                        {isSelectionMode && (selectedBrief || viewMode === 'list') && (
                            <ManualSourceInput
                                manualUrls={manualUrls}
                                setManualUrls={setManualUrls}
                                manualTexts={manualTexts}
                                setManualTexts={setManualTexts}
                            />
                        )}

                        {selectedBrief ? (
                            <>
                                {/* Action Buttons */}
                                <div className="action-row animate-in">
                                    <button
                                        className="back-button"
                                        onClick={() => setSelectedBrief(null)}
                                    >
                                        <span className="icon">←</span> Back to List
                                    </button>


                                </div>

                                {/* Brief Detail */}
                                <div className="hero-section animate-in">
                                    <div className="hero-content">
                                        <div className="date-badge">
                                            <span className="calendar-icon">📅</span>
                                            {selectedBrief.date.split('-')[0]}-{selectedBrief.date.split('-')[1]}-{selectedBrief.date.split('-')[2]}
                                        </div>
                                        <h1 className="hero-title">
                                            Fintech Daily <span className="highlight">Intelligence</span>
                                        </h1>
                                        <p className="hero-subtitle">
                                            Detecting key changes and providing strategic insights for the global Fintech industry.
                                        </p>
                                        <div className="hero-meta">
                                            <div className="meta-item">
                                                <span className="meta-label">Total Signals</span>
                                                <span className="meta-value">{selectedBrief.totalIssues}</span>
                                            </div>
                                            <div className="meta-divider" />
                                            <div className="meta-item">
                                                <span className="meta-label">Generated At</span>
                                                <span className="meta-value">
                                                    {selectedBrief.generatedAt
                                                        ? new Date(selectedBrief.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' EST'
                                                        : 'Archived'}
                                                </span>
                                            </div>
                                            <div className="meta-filler" />
                                        </div>
                                    </div>
                                </div>

                                <div className="issues-container">
                                    {selectedBrief.issues.map((issue, index) => (
                                        <IssueCard
                                            key={index}
                                            issue={issue}
                                            index={index}
                                            onDeepDive={handleDeepDive}
                                            isSelectionMode={isSelectionMode}
                                            isSelected={selectedIssues.some(i => i.headline === issue.headline)}
                                            onSelect={() => toggleIssueSelection(issue)}
                                            briefDate={selectedBrief.date}
                                            hideCart={true}
                                        />
                                    ))}
                                </div>
                            </>
                        ) : briefs.length > 0 ? (
                            viewMode === 'grid' ? (
                                <div className="archive-grid animate-in">
                                    {briefs.map((brief) => (
                                        <a
                                            key={brief.id}
                                            href="#"
                                            className="premium-archive-card"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                loadBriefDetail(brief.date);
                                            }}
                                        >
                                            <div className="archive-card-date">{formatDate(brief.date)}</div>
                                            <div className="archive-card-day">{new Date(brief.date).toLocaleDateString('en-US', { weekday: 'long' })}</div>
                                            <div className="archive-card-footer">
                                                <span className="count">{brief.totalIssues} Signals</span>
                                                <span className="arrow">→</span>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            ) : (
                                <ArchiveListView
                                    briefs={briefs}
                                    selectedIssues={selectedIssues}
                                    onToggleSelection={toggleIssueSelection}
                                    isSelectionMode={isSelectionMode}
                                    onIssueClick={(issue) => loadBriefDetail(issue.date)}
                                />
                            )
                        ) : (
                            <div className="empty-state">
                                <div className="empty-icon">📂</div>
                                <h2 className="empty-title">No stored briefs yet</h2>
                                <p className="empty-description">
                                    Briefs will be automatically stored here once generated.
                                </p>
                                <Link href="/" className="btn">
                                    View Today's Brief
                                </Link>
                            </div>
                        )}
                    </>
                )}

                {loadingDetail && (
                    <div className="modal-overlay">
                        <div className="loading-container">
                            <div className="premium-spinner" />
                            <span className="loading-text">Configuring report...</span>
                        </div>
                    </div>
                )}
            </main>

            <footer className="footer">
                <p>© 2026 Fintech Daily Brief. Stored for 90 days.</p>
            </footer>

            <TrendReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                report={reportContent}
                loading={reportLoading}
                issue={selectedReportIssue}
                onRetry={() => selectedReportIssue && handleDeepDive(selectedReportIssue)}
                onGenerationComplete={() => setReportLoading(false)}
            />

            <style jsx>{`
                .archive-header {
                    margin-bottom: 4rem;
                    text-align: center;
                }
                .archive-title {
                    font-size: 3rem;
                    font-weight: 900;
                    margin-bottom: 1rem;
                    letter-spacing: -0.04em;
                }
                .archive-title .highlight {
                    color: var(--accent-color);
                }
                .archive-subtitle {
                    color: var(--text-secondary);
                    font-size: 1.1rem;
                    margin-bottom: 2rem;
                }
                .view-switcher {
                    display: flex;
                    justify-content: center;
                    gap: 1rem;
                    margin-top: 1rem;
                }
                .view-btn {
                    background: var(--bg-secondary);
                    border: 1.5px solid var(--border-color);
                    border-radius: 12px;
                    padding: 8px 16px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .view-btn:hover {
                    border-color: var(--accent-color);
                    color: var(--accent-color);
                }
                .view-btn.active {
                    background: var(--accent-color);
                    color: white;
                    border-color: var(--accent-color);
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
                }
                .archive-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
                    gap: 1.5rem;
                }
                .premium-archive-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 1.5rem;
                    text-decoration: none;
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .premium-archive-card:hover {
                    transform: translateY(-5px);
                    border-color: var(--accent-color);
                    box-shadow: var(--shadow-md);
                }
                .archive-card-date {
                    font-size: 1.1rem;
                    font-weight: 800;
                    color: var(--text-primary);
                }
                .archive-card-day {
                    font-size: 0.9rem;
                    color: var(--text-muted);
                    font-weight: 600;
                    margin-bottom: 1rem;
                }
                .archive-card-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: auto;
                    padding-top: 1rem;
                    border-top: 1px solid var(--border-color);
                }
                .archive-card-footer .count {
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: var(--accent-color);
                }
                .archive-card-footer .arrow {
                    transition: transform 0.2s;
                }
                .premium-archive-card:hover .arrow {
                    transform: translateX(4px);
                }
                .action-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 2rem;
                }
                .back-button, .delete-button {
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 8px 16px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                }
                .back-button:hover {
                    background: var(--bg-card);
                    border-color: var(--accent-color);
                }
                .delete-button {
                    color: var(--error-color);
                }
                .delete-button:hover {
                    background: var(--error-color);
                    color: white;
                    border-color: var(--error-color);
                }
                .detail-hero {
                    background: var(--bg-secondary);
                    padding: 3rem 0;
                    border-radius: 32px;
                    border: 1px solid var(--border-color);
                    margin-bottom: 3rem;
                }
                .detail-title {
                    font-size: 2rem;
                    font-weight: 900;
                    margin-bottom: 2rem;
                    letter-spacing: -0.02em;
                }
                .modal-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);
                    display: flex; justify-content: center; align-items: center;
                    z-index: 1000;
                }
                .animate-in {
                    animation: fadeInUp 0.6s ease-out forwards;
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .selection-toolbar {
                    display: flex;
                    gap: 0.75rem;
                    margin-bottom: 1.5rem;
                    flex-wrap: wrap;
                    align-items: center;
                }

                .selection-toggle-btn {
                    background: var(--bg-card);
                    border: 1.5px solid var(--border-color);
                    padding: 10px 20px;
                    border-radius: 14px;
                    cursor: pointer;
                    font-size: 0.88rem;
                    font-weight: 700;
                    color: var(--text-secondary);
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    letter-spacing: -0.01em;
                }
                .selection-toggle-btn:hover {
                    border-color: var(--accent-color);
                    color: var(--accent-color);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.12);
                }
                .selection-toggle-btn.active {
                    background: linear-gradient(135deg, #6366f1, #818cf8);
                    color: white;
                    border-color: transparent;
                    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
                }
                .selection-toggle-btn.active:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
                }

                .generate-report-btn {
                    background: linear-gradient(135deg, #6366f1, #a855f7);
                    color: white;
                    border: none;
                    padding: 10px 22px;
                    border-radius: 14px;
                    font-size: 0.88rem;
                    font-weight: 700;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3);
                    transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    letter-spacing: -0.01em;
                }
                .generate-report-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
                }

                @media (max-width: 480px) {
                    .archive-header { margin-bottom: 2.5rem; }
                    .archive-title { font-size: 2rem; letter-spacing: -0.04em; }
                    .archive-subtitle { font-size: 0.9rem; }
                    .view-switcher-container { flex-direction: column; gap: 1rem; }
                    .weekly-start-btn { width: 100%; justify-content: center; }
                }

                /* Weekly Panel Styles */
                .view-switcher-container {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 2rem;
                    gap: 20px;
                }
                .weekly-trigger-container {
                    flex: 1;
                    max-width: 600px;
                    display: flex;
                    justify-content: flex-end;
                }
                .weekly-start-btn {
                    background: linear-gradient(135deg, #6366f1, #a855f7);
                    color: white;
                    border: none;
                    padding: 10px 24px;
                    border-radius: 14px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.2);
                    transition: all 0.2s;
                }
                .weekly-start-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.3);
                }
                .weekly-control-panel {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 20px;
                    padding: 20px;
                    width: 100%;
                    position: relative;
                }
                .card-glow {
                    box-shadow: 0 0 20px rgba(99,102,241, 0.1);
                }
                .panel-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 20px;
                }
                .panel-title {
                    font-size: 1rem;
                    font-weight: 800;
                    margin-bottom: 4px;
                    color: var(--text-primary);
                }
                .panel-desc {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }
                .panel-close {
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    color: var(--text-muted);
                    cursor: pointer;
                    line-height: 1;
                }
                .weekly-action-btn {
                    background: var(--accent-color);
                    color: white;
                    border: none;
                    width: 100%;
                    padding: 12px;
                    border-radius: 12px;
                    font-weight: 700;
                    cursor: pointer;
                }
                .progress-container {
                    padding-top: 10px;
                }
                .progress-info {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .status-badge {
                    font-size: 0.75rem;
                    font-weight: 900;
                    text-transform: uppercase;
                    color: var(--accent-color);
                }
                .progress-percent {
                    font-size: 0.8rem;
                    font-weight: 800;
                }
                .progress-track {
                    height: 8px;
                    background: var(--bg-secondary);
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 8px;
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #6366f1, #a855f7);
                    transition: width 0.4s ease;
                }
                .progress-msg {
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    text-align: center;
                }
                .status-error {
                    color: var(--error-color);
                    font-size: 0.8rem;
                    margin-top: 8px;
                    text-align: center;
                }
                .pulse {
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
            `}</style>
        </div>
    );
}

