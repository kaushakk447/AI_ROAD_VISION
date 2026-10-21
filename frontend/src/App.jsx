import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowRight, BarChart3, Bike, Boxes,
  CarFront, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, CloudUpload,
  Cpu, Crosshair, FileImage, FileVideo2, Filter, Gauge, History, ImagePlus,
  LayoutDashboard, LoaderCircle, LogOut, Menu, MoreHorizontal, RefreshCw, ScanLine,
  Settings2, ShieldCheck, Sparkles, Trash2, Truck, Users, X, Zap,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { absoluteApiUrl, api, apiError, AUTH_TOKEN_KEY, downloadApiFile } from './services/api.js'

const navigation = [
  { label: 'Overview', path: '/', icon: LayoutDashboard },
  { label: 'Image detection', path: '/images', icon: ImagePlus },
  { label: 'Video analysis', path: '/videos', icon: FileVideo2 },
  { label: 'Traffic analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Detection history', path: '/history', icon: History },
  { label: 'Settings', path: '/settings', icon: Settings2 },
]

const chartColors = ['#e8aa61', '#78c3af', '#92adc4', '#b596c5', '#dc8273', '#9fb97f', '#d29568']

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value || 0)
}

function formatDuration(value) {
  if (!Number.isFinite(value)) return '—'
  return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(1)} s`
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function titleCase(value = '') {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function StatusBadge({ status }) {
  const Icon = status === 'completed' ? CheckCircle2 : status === 'failed' ? AlertTriangle : LoaderCircle
  return <span className={`status-badge status-${status || 'processing'}`}><Icon size={13} />{titleCase(status || 'processing')}</span>
}

function EmptyState({ icon: Icon = ScanLine, title, message, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={23} /></span><h3>{title}</h3><p>{message}</p>{action}</div>
}

function ErrorNotice({ children, onDismiss }) {
  if (!children) return null
  return <div className="notice error-notice"><AlertTriangle size={17} /><span>{children}</span>{onDismiss && <button className="icon-button notice-dismiss" aria-label="Dismiss error" onClick={onDismiss}><X size={16} /></button>}</div>
}

function useApiMedia(path) {
  const [source, setSource] = useState('')
  useEffect(() => {
    let active = true
    let objectUrl = ''
    setSource('')
    if (!path) return undefined
    api.get(absoluteApiUrl(path), { responseType: 'blob', timeout: 0 }).then(({ data }) => {
      objectUrl = URL.createObjectURL(data)
      if (active) setSource(objectUrl)
      else URL.revokeObjectURL(objectUrl)
    }).catch(() => {})
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])
  return source
}

function DownloadButton({ path, className, children }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const download = async () => {
    setDownloading(true)
    setError('')
    try { await downloadApiFile(path) }
    catch (failure) { setError(apiError(failure, 'Could not download this file.')) }
    finally { setDownloading(false) }
  }
  return <button type="button" className={className} onClick={download} disabled={downloading} title={error || undefined} aria-label={error || undefined}>{children}</button>
}

function Sidebar({ open, onNavigate }) {
  return <>
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onNavigate} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <Link to="/" className="brand" onClick={onNavigate}>
        <span className="brand-mark"><Crosshair size={22} strokeWidth={2.4} /></span>
        <span className="brand-copy"><strong>road<span>vision</span></strong><small>COMPUTER VISION PLATFORM</small></span>
      </Link>
      <div className="sidebar-caption">WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">
        {navigation.map(({ label, path, icon: Icon }) => <NavLink key={path} to={path} end={path === '/'} onClick={onNavigate} aria-label={label} title={label} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}>
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Overview' && <span className="nav-live-dot" />}
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-help"><div className="help-icon"><CircleHelp size={17} /></div><div><strong>Road vision, made clear.</strong><p>Analyze roads with configured AI models.</p></div></div>
        <div className="sidebar-version"><span className="version-dot" /> CONNECTED WORKSPACE <span>v1.0</span></div>
      </div>
    </aside>
  </>
}

function Header({ health, onMenu, authEnabled, onLogout }) {
  const location = useLocation()
  const page = navigation.find((item) => item.path === location.pathname)
  return <header className="topbar">
    <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={onMenu}><Menu size={20} /></button>
    <div className="page-heading"><div className="breadcrumb">ROADVISION <span>/</span> WORKSPACE</div><h1>{page?.label || 'Overview'}</h1></div>
    <div className="topbar-right">
      <div className={`connection-pill ${health ? 'connection-online' : 'connection-offline'}`}><span />{health ? 'API connected' : 'API unavailable'}</div>
      {authEnabled ? <button className="user-avatar logout-button" title="Sign out" aria-label="Sign out" onClick={onLogout}><LogOut size={14} /></button> : <div className="user-avatar" title="Local workspace">RV</div>}
    </div>
  </header>
}

function AppLayout({ authEnabled, onLogout }) {
  const [health, setHealth] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const refreshHealth = useCallback(() => api.get('/health').then(() => setHealth(true)).catch(() => setHealth(false)), [])
  useEffect(() => {
    refreshHealth()
    const timer = window.setInterval(refreshHealth, 15000)
    return () => window.clearInterval(timer)
  }, [refreshHealth])
  return <div className="app-shell"><Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} /><div className="main-column"><Header health={health} onMenu={() => setMenuOpen(true)} authEnabled={authEnabled} onLogout={onLogout} /><main className="page-content"><Outlet context={{ health, refreshHealth }} /></main><footer className="footer"><span>AI ROAD VISION</span><span>Computer vision workspace · Results come from your configured model</span></footer></div></div>
}

function StatCard({ icon: Icon, label, value, sub, tone = 'cyan' }) {
  return <article className="stat-card"><div className={`stat-icon tone-${tone}`}><Icon size={19} /></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-sub">{sub}</div></article>
}

function JobTable({ jobs = [], compact = false, onOpen }) {
  if (!jobs.length) return <EmptyState icon={History} title="No detections yet" message="Your completed image and video jobs will appear here." action={<Link to="/images" className="text-link">Run your first detection <ArrowRight size={14} /></Link>} />
  return <div className="table-wrap"><table className={`data-table ${compact ? 'compact-table' : ''}`}><thead><tr><th>JOB</th><th>TYPE</th><th>OBJECTS</th><th>DATE</th><th>STATUS</th><th /></tr></thead><tbody>
    {jobs.map((job) => <tr key={job.id} onClick={() => onOpen?.(job)} className={onOpen ? 'clickable-row' : ''}>
      <td><div className="job-name"><span className={`file-chip ${job.kind === 'video' ? 'video-chip' : ''}`}>{job.kind === 'video' ? <FileVideo2 size={15} /> : <FileImage size={15} />}</span><span><strong>{job.filename}</strong><small>#{job.id.slice(0, 8)}</small></span></div></td>
      <td><span className="type-label">{titleCase(job.kind)}</span></td><td><strong>{job.status === 'completed' ? formatNumber(job.detections_count) : '—'}</strong></td><td className="date-cell">{formatDate(job.created_at)}</td><td><StatusBadge status={job.status} /></td><td><MoreHorizontal size={18} className="muted-icon" /></td>
    </tr>)}
  </tbody></table></div>
}

function OverviewPage() {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { const { data } = await api.get('/analytics/summary'); setSummary(data); setError('') }
    catch (failure) { setError(apiError(failure, 'Could not load dashboard data.')); }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const categories = summary?.category_counts || []
  const heroJob = summary?.recent_jobs?.find((job) => job.kind === 'image' && job.status === 'completed' && job.annotated_result_url)
  const heroImage = useApiMedia(heroJob?.annotated_result_url)
  return <div className="page-stack">
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" /> ROADVISION / ANALYTICS</div><h2>Traffic, at a glance.</h2><p>A clear view of vehicles, pedestrians, and activity across your analyses.</p></div><button className="button button-secondary" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button></div>
    <ErrorNotice>{error}</ErrorNotice>
    <div className="dashboard-grid overview-dashboard-grid">
      <section className="overview-hero" aria-label="Traffic analytics overview">
        {heroJob && heroImage && <img className="overview-hero-image" src={heroImage} alt="Latest analyzed road scene" />}
        <div className="overview-hero-art" aria-hidden="true" />
        <div className="overview-hero-shade" />
        <div className="overview-hero-topline"><span className="hero-kicker"><span className="hero-kicker-dot" /> ROAD VISION / LIVE ANALYTICS</span><span className="hero-live"><span />{heroJob ? 'LATEST ANALYSIS' : 'MODEL READY'}</span></div>
        <div className="overview-hero-copy"><h2>Every road,<br />in focus.</h2><p>Understand the flow of traffic with real detections from your local AI workspace.</p><Link to="/images" className="button button-primary">Start an analysis <ArrowRight size={15} /></Link></div>
        <div className="overview-hero-metrics">
          <div><span>Objects detected</span><strong>{loading ? '—' : formatNumber(summary?.total_detections)}</strong></div>
          <div><span>Vehicles</span><strong>{loading ? '—' : formatNumber(summary?.vehicles)}</strong></div>
          <div><span>Pedestrians</span><strong>{loading ? '—' : formatNumber(summary?.pedestrians)}</strong></div>
          <div><span>Avg. processing</span><strong>{loading ? '—' : formatDuration(summary?.average_processing_time_seconds)}</strong></div>
        </div>
      </section>
      <section className="panel chart-panel"><div className="panel-heading"><div><div className="section-kicker">DETECTION MIX</div><h3>Objects by category</h3></div><span className="panel-icon"><BarChart3 size={17} /></span></div>
        {categories.length ? <div className="category-chart"><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categories} dataKey="count" nameKey="name" innerRadius={42} outerRadius={58} paddingAngle={3} stroke="none">{categories.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip contentStyle={{ background: 'rgba(39, 38, 37, .96)', border: '1px solid #4a4742', borderRadius: 12, color: '#f2eee6', boxShadow: '0 12px 32px rgba(0, 0, 0, .28)' }} itemStyle={{ color: '#f2eee6' }} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{formatNumber(summary?.total_detections)}</strong><span>detections</span></div></div><div className="legend-list">{categories.slice(0, 6).map((item, index) => <div className="legend-item" key={item.name}><span className="legend-dot" style={{ background: chartColors[index % chartColors.length] }} /><span>{titleCase(item.name)}</span><strong>{formatNumber(item.count)}</strong></div>)}</div></div> : <EmptyState icon={ScanLine} title="Waiting for your first detection" message="Run image or video analysis to see real model predictions in this chart." />}
      </section>
      <section className="panel activity-panel"><div className="panel-heading"><div><div className="section-kicker">ACTIVITY</div><h3>Detection activity</h3></div><span className="period-label"><Activity size={14} /> By job date</span></div>
        {summary?.detections_over_time?.some((item) => item.detections > 0) ? <div className="activity-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={summary.detections_over_time} margin={{ top: 12, right: 6, bottom: 0, left: -16 }}><defs><linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e8aa61" stopOpacity={0.26} /><stop offset="92%" stopColor="#e8aa61" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#45423e" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="date" tick={{ fill: '#aaa49a', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#aaa49a', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: 'rgba(39, 38, 37, .96)', border: '1px solid #4a4742', borderRadius: 12, color: '#f2eee6', boxShadow: '0 12px 32px rgba(0, 0, 0, .28)' }} /><Area type="monotone" dataKey="detections" stroke="#e8aa61" strokeWidth={2} fill="url(#activityFill)" /></AreaChart></ResponsiveContainer></div> : <EmptyState icon={BarChart3} title="No activity to chart" message="Detection counts by date will appear after you process media." />}
        <div className="activity-foot"><span><span className="activity-key" /> Detections</span><span>Actual stored results</span></div>
      </section>
    </div>
    <section className="panel recent-panel"><div className="panel-heading"><div><div className="section-kicker">YOUR WORK</div><h3>Recent detection jobs</h3></div><Link to="/history" className="button button-quiet">View history <ArrowRight size={15} /></Link></div><JobTable jobs={summary?.recent_jobs || []} compact /></section>
    <section className="quickstart-strip"><div className="quickstart-icon"><Sparkles size={19} /></div><div><strong>Ready when you are</strong><p>Choose an image for a quick detection, or analyze a full video with optional object tracking.</p></div><div className="quickstart-actions"><Link to="/images" className="button button-secondary"><ImagePlus size={15} /> Image detection</Link><Link to="/videos" className="button button-primary"><FileVideo2 size={15} /> Analyze video</Link></div></section>
  </div>
}

function DropZone({ accept, file, onFile, inputRef, title, subtitle, compact = false, maxSizeMB = 250 }) {
  const [dragging, setDragging] = useState(false)
  const [validationError, setValidationError] = useState('')
  const extensions = accept.split(',').map((value) => value.trim().toLowerCase()).filter((value) => value.startsWith('.'))
  const chooseFile = (selected) => {
    if (!selected) return
    const extension = selected.name.includes('.') ? `.${selected.name.split('.').pop()?.toLowerCase()}` : ''
    if (!extensions.includes(extension)) { setValidationError(`Choose a supported file: ${extensions.join(', ')}.`); onFile(null); return }
    if (selected.size > maxSizeMB * 1024 * 1024) { setValidationError(`This file exceeds the ${maxSizeMB} MB upload limit.`); onFile(null); return }
    setValidationError('')
    onFile(selected)
  }
  const choose = (event) => { chooseFile(event.target.files?.[0]); event.target.value = '' }
  return <div className={`dropzone ${dragging ? 'dropzone-active' : ''} ${compact ? 'dropzone-compact' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]) }}>
    <input ref={inputRef} type="file" accept={accept} onChange={choose} hidden />
    {file ? <><span className="drop-icon selected-file-icon">{extensions.some((extension) => ['.mp4', '.avi', '.mov', '.mkv'].includes(extension)) ? <FileVideo2 size={22} /> : <FileImage size={22} />}</span><strong className="selected-file-name">{file.name}</strong><span className="drop-hint">{(file.size / (1024 * 1024)).toFixed(1)} MB · click to change</span><button type="button" className="button button-quiet browse-button" onClick={() => inputRef.current?.click()}>Choose another</button></> : <><span className="drop-icon"><CloudUpload size={23} /></span><strong>{title}</strong><span className="drop-hint">{subtitle}</span><button type="button" className="button button-secondary browse-button" onClick={() => inputRef.current?.click()}>Browse files</button></>}
    {validationError && <span className="drop-error">{validationError}</span>}
  </div>
}

function ConfidenceControl({ value, onChange }) {
  return <label className="field-group confidence-field"><span className="field-label">CONFIDENCE THRESHOLD <strong>{Number(value).toFixed(2)}</strong></span><div className="range-wrap"><span>0.05</span><input type="range" min="0.05" max="0.95" step="0.05" value={value} onChange={(event) => onChange(Number(event.target.value))} /><span>0.95</span></div><small>Higher values show fewer, more confident predictions.</small></label>
}

function DetectionDetails({ result }) {
  const detections = result?.detections || []
  return <section className="panel result-details"><div className="panel-heading"><div><div className="section-kicker">PREDICTION DETAILS</div><h3>Detected objects <span className="count-pill">{detections.length}</span></h3></div><DownloadButton className="button button-secondary" path={result.annotated_result_url}><ArrowDownToLine size={15} /> Download image</DownloadButton></div>
    {detections.length ? <div className="detection-list">{detections.slice(0, 100).map((detection, index) => <div className="detection-row" key={`${detection.class_id}-${index}`}><span className="detection-index">{String(index + 1).padStart(2, '0')}</span><span className="detection-name">{titleCase(detection.class_name)}</span><span className="confidence-track"><span style={{ width: `${Math.round(detection.confidence * 100)}%` }} /></span><strong>{(detection.confidence * 100).toFixed(1)}%</strong></div>)}</div> : <EmptyState icon={ScanLine} title="No objects detected" message="The selected model returned no objects above this confidence threshold." />}
  </section>
}

function ImagePage() {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [maxUploadMB, setMaxUploadMB] = useState(250)
  const [confidence, setConfidence] = useState(0.35)
  const [models, setModels] = useState([])
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const annotatedPreview = useApiMedia(result?.annotated_result_url)
  useEffect(() => { api.get('/settings').then(({ data }) => { setConfidence(data.confidence_threshold); setMaxUploadMB(data.max_upload_mb); const available = data.models?.models || []; setModels(available); setModel(data.models?.default_model || '') }).catch(() => {}) }, [])
  useEffect(() => { if (!file) { setPreview(''); return undefined } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url) }, [file])
  const selectFile = (selected) => { setError(''); setResult(null); setShowOriginal(false); setFile(selected) }
  const submit = async (event) => {
    event.preventDefault()
    if (!file) { setError('Choose an image before starting detection.'); return }
    const form = new FormData(); form.append('file', file); form.append('confidence', confidence); if (model) form.append('model', model)
    setBusy(true); setError('')
    try { const { data } = await api.post('/detect/image', form, { timeout: 600000 }); setResult(data) }
    catch (failure) { setError(apiError(failure, 'Image detection failed. Check the backend and model status.')) }
    finally { setBusy(false) }
  }
  return <div className="page-stack">
    <div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> IMAGE ANALYSIS</div><h2>Find what’s on the road.</h2><p>Upload a road image and let your configured YOLO model identify objects.</p></div><span className="intro-badge"><ShieldCheck size={14} /> Backend processing</span></div>
    <ErrorNotice onDismiss={() => setError('')}>{error}</ErrorNotice>
    <div className="image-workspace">
      <form className="panel upload-panel" onSubmit={submit}><div className="panel-heading"><div><div className="section-kicker">NEW ANALYSIS</div><h3>Image detection</h3></div><span className="panel-icon"><FileImage size={17} /></span></div>
        <DropZone accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" file={file} onFile={selectFile} inputRef={inputRef} title="Drop your road image here" subtitle={`JPG, PNG or WebP · up to ${maxUploadMB} MB`} maxSizeMB={maxUploadMB} />
        <ConfidenceControl value={confidence} onChange={setConfidence} />
        <label className="field-group"><span className="field-label">MODEL WEIGHTS</span><span className="select-wrap"><Cpu size={15} /><select value={model} onChange={(event) => setModel(event.target.value)}>{models.length ? models.map((item) => <option key={item.name} value={item.name}>{item.name}{item.name === 'yolov8s.pt' ? ' · higher accuracy' : ''}{item.available ? '' : ' · downloads on first use'}</option>) : model && <option value={model}>{model}</option>}</select><ChevronDown size={15} /></span><small>YOLOv8s is more accurate on COCO benchmarks, but slower on CPU. First use downloads its weights.</small></label>
        <button className="button button-primary button-wide" disabled={busy || !file}>{busy ? <><LoaderCircle size={16} className="spin" /> Running detection…</> : <><ScanLine size={16} /> Run detection <ArrowRight size={15} /></>}</button>
        <div className="upload-footnote"><ShieldCheck size={14} />{busy ? ' First run may take a few minutes while the model loads.' : ' Images are processed by your configured backend.'}</div>
      </form>
      <section className="panel preview-panel"><div className="panel-heading"><div><div className="section-kicker">RESULT PREVIEW</div><h3>{result ? 'Detection output' : 'Image preview'}</h3></div>{result && <span className="success-mark"><Check size={14} /> COMPLETE</span>}</div>
        {result ? <><div className="image-preview result-image-preview"><img src={showOriginal ? preview : annotatedPreview} alt={showOriginal ? 'Original uploaded road image' : 'Annotated road image with YOLO detections'} /><div className="image-preview-overlay"><span>{showOriginal ? 'ORIGINAL' : 'ANNOTATED'}</span><button className="preview-toggle" onClick={() => setShowOriginal((value) => !value)}>{showOriginal ? 'Show detections' : 'Compare original'} <ChevronDown size={13} /></button></div></div><div className="result-metrics"><div><span>Objects</span><strong>{formatNumber(result.detections.length)}</strong></div><div><span>Processing</span><strong>{formatDuration(result.processing_time_seconds)}</strong></div><div><span>Resolution</span><strong>{result.image_width} × {result.image_height}</strong></div></div></> : preview ? <div className="image-preview"><img src={preview} alt="Selected road image preview" /><div className="image-preview-overlay"><span>INPUT IMAGE</span></div></div> : <EmptyState icon={ImagePlus} title="Your result will appear here" message="Choose an image to preview it, then run detection to see annotated predictions." />}
        {result && <div className="preview-meta"><span><span className="live-dot" /> {result.model}</span><span>{Object.entries(result.class_counts).map(([name, count]) => `${count} ${titleCase(name)}`).join(' · ') || 'No objects returned'}</span></div>}
      </section>
    </div>
    {result && <DetectionDetails result={result} />}
  </div>
}

function VideoPage() {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [confidence, setConfidence] = useState(0.35)
  const [frameInterval, setFrameInterval] = useState(1)
  const [tracking, setTracking] = useState(true)
  const [model, setModel] = useState('')
  const [models, setModels] = useState([])
  const [job, setJob] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const [tracks, setTracks] = useState([])
  const [maxUploadMB, setMaxUploadMB] = useState(250)
  const videoPreview = useApiMedia(job?.status === 'completed' ? job.annotated_result_url : '')
  useEffect(() => { api.get('/settings').then(({ data }) => { setConfidence(data.confidence_threshold); setMaxUploadMB(data.max_upload_mb); setModels(data.models?.models || []); setModel(data.models?.default_model || '') }).catch(() => {}) }, [])
  useEffect(() => {
    const jobId = job?.job_id || job?.id
    if (!jobId || job.status !== 'processing') return undefined
    let active = true
    const poll = async () => { try { const { data } = await api.get(`/jobs/${jobId}`); if (active) { setJob(data); setProgress(data.progress || 0) } } catch (failure) { if (active) setError(apiError(failure, 'Could not refresh the video job.')) } }
    poll()
    const timer = window.setInterval(poll, 1200)
    return () => { active = false; window.clearInterval(timer) }
  }, [job?.job_id, job?.id, job?.status])
  useEffect(() => {
    if (job?.status !== 'completed' || !job.tracking) { setTracks([]); return undefined }
    let active = true
    api.get(`/jobs/${job.id}/tracks`).then(({ data }) => { if (active) setTracks(data.tracks || []) }).catch((failure) => { if (active) setError(apiError(failure, 'Could not load object track summaries.')) })
    return () => { active = false }
  }, [job?.id, job?.status, job?.tracking])
  const submit = async (event) => {
    event.preventDefault()
    if (!file) { setError('Choose a video before starting analysis.'); return }
    const form = new FormData(); form.append('file', file); form.append('confidence', confidence); form.append('frame_interval', frameInterval); form.append('tracking', tracking); if (model) form.append('model', model)
    setBusy(true); setError(''); setJob(null); setProgress(0); setUploadProgress(0)
    try { const { data } = await api.post('/detect/video', form, { onUploadProgress: (event) => { if (event.total) setUploadProgress(Math.round(event.loaded * 100 / event.total)) } }); setJob(data) }
    catch (failure) { setError(apiError(failure, 'Video upload failed. Check the backend and model status.')) }
    finally { setBusy(false) }
  }
  const running = job?.status === 'processing'
  return <div className="page-stack">
    <div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> VIDEO & TRACKING</div><h2>Follow the flow of traffic.</h2><p>Analyze road video, measure frame level detections, and track objects across frames.</p></div><span className="intro-badge"><Gauge size={14} /> Sampled processing</span></div>
    <ErrorNotice onDismiss={() => setError('')}>{error}</ErrorNotice>
    <div className="video-layout"><form className="panel video-form" onSubmit={submit}><div className="panel-heading"><div><div className="section-kicker">VIDEO JOB</div><h3>Configure analysis</h3></div><span className="panel-icon"><FileVideo2 size={17} /></span></div>
      <DropZone accept=".mp4,.avi,.mov,.mkv,video/mp4,video/x-msvideo,video/quicktime,video/x-matroska" file={file} onFile={(selected) => { setFile(selected); setError(''); setJob(null) }} inputRef={inputRef} title="Drop a road video here" subtitle={`MP4, AVI, MOV or MKV · up to ${maxUploadMB} MB`} maxSizeMB={maxUploadMB} compact />
      <ConfidenceControl value={confidence} onChange={setConfidence} />
      <label className="field-group"><span className="field-label">FRAME SAMPLING</span><span className="select-wrap"><Activity size={15} /><select value={frameInterval} onChange={(event) => setFrameInterval(Number(event.target.value))}><option value="1">Every frame · best detail</option><option value="2">Every 2nd frame</option><option value="3">Every 3rd frame</option><option value="5">Every 5th frame · faster</option><option value="10">Every 10th frame · fastest</option></select><ChevronDown size={15} /></span><small>Skipped frames stay in the annotated video without predictions.</small></label>
      <label className="field-group"><span className="field-label">MODEL WEIGHTS</span><span className="select-wrap"><Cpu size={15} /><select value={model} onChange={(event) => setModel(event.target.value)}>{models.length ? models.map((item) => <option key={item.name} value={item.name}>{item.name}{item.name === 'yolov8s.pt' ? ' · higher accuracy' : ''}{item.available ? '' : ' · downloads on first use'}</option>) : model && <option value={model}>{model}</option>}</select><ChevronDown size={15} /></span><small>YOLOv8s scores higher on COCO benchmarks, but takes longer per frame on CPU.</small></label>
      <button className={`tracking-toggle ${tracking ? 'tracking-on' : ''}`} type="button" onClick={() => setTracking((value) => !value)}><span className={`toggle-track ${tracking ? 'toggle-checked' : ''}`}><span /></span><span><strong>Track objects across frames</strong><small>ByteTrack IDs and unique track counts</small></span><Crosshair size={17} /></button>
      <button className="button button-primary button-wide" disabled={busy || running || !file}>{busy ? <><LoaderCircle size={16} className="spin" /> Uploading {uploadProgress}%</> : running ? <><LoaderCircle size={16} className="spin" /> Processing video…</> : <><FileVideo2 size={16} /> Start video analysis <ArrowRight size={15} /></>}</button>
      {busy && <div className="upload-progress"><span style={{ width: `${uploadProgress}%` }} /></div>}
      <div className="upload-footnote"><ShieldCheck size={14} /> Video runs as a background job on your backend.</div>
    </form>
    <section className="panel video-result-panel"><div className="panel-heading"><div><div className="section-kicker">JOB STATUS</div><h3>{job ? job.filename : 'Video analysis'}</h3></div>{job && <StatusBadge status={job.status} />}</div>
      {job ? <div className="video-job-result"><div className="job-progress-copy"><span>{job.status === 'completed' ? 'Analysis complete' : job.status === 'failed' ? 'Analysis failed' : 'Processing sampled frames'}</span><strong>{Math.round(job.status === 'completed' ? 100 : progress)}%</strong></div><div className="progress-track"><span style={{ width: `${job.status === 'completed' ? 100 : progress}%` }} /></div>
        {job.status === 'processing' && <div className="processing-note"><LoaderCircle size={16} className="spin" /><span>The video is processing in the background. You can keep this page open while progress updates.</span></div>}
        {job.status === 'failed' && <ErrorNotice>{job.error || 'Video processing failed. Check backend logs and model availability.'}</ErrorNotice>}
        {job.status === 'completed' && <><div className="video-stats-grid"><div><span>FRAME DETECTIONS</span><strong>{formatNumber(job.detections_count)}</strong></div><div><span>UNIQUE TRACKS</span><strong>{job.tracking ? formatNumber(job.unique_tracks) : 'Tracking off'}</strong></div><div><span>PROCESSED FPS</span><strong>{job.processing_fps ? `${job.processing_fps.toFixed(1)} fps` : '—'}</strong></div><div><span>PROCESSING TIME</span><strong>{formatDuration(job.processing_time_seconds)}</strong></div></div>{job.tracking && <div className="tracking-note"><Crosshair size={15} /><span>Track IDs are local video identities. They do not measure real-world distance or speed.</span></div>}{videoPreview && <video className="annotated-video" controls src={videoPreview} />}<div className="result-actions"><DownloadButton className="button button-primary" path={job.annotated_result_url}><ArrowDownToLine size={15} /> Download annotated video</DownloadButton><DownloadButton className="button button-secondary" path={job.report_url}><ArrowDownToLine size={15} /> CSV report</DownloadButton></div><div className="video-category-list">{Object.entries(job.class_counts || {}).map(([name, count]) => <span key={name}>{titleCase(name)} <strong>{formatNumber(count)}</strong></span>)}</div></>}
      </div> : <EmptyState icon={FileVideo2} title="Your video job will appear here" message="Choose a supported road video, tune the sampling and tracking options, and start analysis." />}
    </section></div>
    {job?.status === 'completed' && <section className="panel"><div className="panel-heading"><div><div className="section-kicker">TRACKING SUMMARY</div><h3>Frame detections & object tracks</h3></div><span className="panel-icon"><Crosshair size={17} /></span></div><div className="tracking-summary-grid">{Object.entries(job.class_counts || {}).map(([name, count], index) => <div className="tracking-summary-card" key={name}><span className="tracking-color-dot" style={{ background: chartColors[index % chartColors.length] }} /><span>{titleCase(name)}</span><strong>{formatNumber(count)}</strong></div>)}{!Object.keys(job.class_counts || {}).length && <p className="muted-copy">No detections were returned by the model.</p>}</div>{job.tracking && <div className="track-table-wrap"><div className="track-table-heading"><span>TRACK ID</span><span>CLASS</span><span>OBSERVATIONS</span><span>FIRST → LAST FRAME</span></div>{tracks.map((track) => <div className="track-table-row" key={track.track_id}><strong>#{track.track_id}</strong><span>{titleCase(track.class_name)}</span><span>{formatNumber(track.observations)}</span><span>{track.first_frame} → {track.last_frame}</span></div>)}{!tracks.length && <p className="muted-copy">No persistent tracks were returned by the tracker.</p>}<p className="track-note">Track summaries use sampled frame positions. Trajectory coordinates are available from the job tracks API in image pixels.</p></div>}</section>}
  </div>
}

function AnalyticsPage() {
  const [summary, setSummary] = useState(null)
  const [jobs, setJobs] = useState([])
  const [jobId, setJobId] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => { Promise.all([api.get('/analytics/summary'), api.get('/jobs', { params: { limit: 100 } })]).then(([stats, jobData]) => { setCategories(stats.data.category_counts || []); setJobs(jobData.data.jobs || []) }).catch((failure) => setError(apiError(failure, 'Could not load analytics filters.'))) }, [])
  useEffect(() => { setLoading(true); api.get('/analytics/summary', { params: { ...(jobId ? { job_id: jobId } : {}), ...(category ? { category } : {}) } }).then(({ data }) => { setSummary(data); setError('') }).catch((failure) => setError(apiError(failure, 'Could not load analytics.'))).finally(() => setLoading(false)) }, [jobId, category])
  const selectedJob = jobs.find((job) => job.id === jobId)
  return <div className="page-stack">
    <div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> TRAFFIC INTELLIGENCE</div><h2>Make every detection count.</h2><p>Explore measured object counts from completed jobs. Video detections are counted per sampled frame.</p></div><span className="intro-badge"><BarChart3 size={14} /> Real stored detections</span></div>
    <ErrorNotice>{error}</ErrorNotice>
    <section className="panel filter-panel"><div className="filter-title"><Filter size={16} /><strong>Filter analytics</strong></div><label className="filter-control"><span>JOB</span><select value={jobId} onChange={(event) => setJobId(event.target.value)}><option value="">All completed jobs</option>{jobs.filter((job) => job.status === 'completed').map((job) => <option key={job.id} value={job.id}>{job.filename}</option>)}</select><ChevronDown size={14} /></label><label className="filter-control"><span>CATEGORY</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option value={item.name} key={item.name}>{titleCase(item.name)}</option>)}</select><ChevronDown size={14} /></label>{(jobId || category) && <button className="clear-filter" onClick={() => { setJobId(''); setCategory('') }}>Clear filters <X size={13} /></button>}</section>
    <div className="stats-grid analytics-stats"><StatCard icon={Boxes} label="Frame detections" value={loading ? '—' : formatNumber(summary?.total_detections)} sub={selectedJob ? selectedJob.filename : 'Matching stored detections'} tone="cyan" /><StatCard icon={CarFront} label="Vehicles" value={loading ? '—' : formatNumber(summary?.vehicles)} sub="Car, truck, bus, bike & more" tone="blue" /><StatCard icon={Users} label="Pedestrians" value={loading ? '—' : formatNumber(summary?.pedestrians)} sub="Frame level person detections" tone="violet" /><StatCard icon={Clock3} label="Average runtime" value={loading ? '—' : formatDuration(summary?.average_processing_time_seconds)} sub={summary?.average_processing_fps ? `${summary.average_processing_fps.toFixed(1)} sampled FPS` : 'Across matching jobs'} tone="amber" /></div>
    <div className="dashboard-grid analytics-charts"><section className="panel chart-panel"><div className="panel-heading"><div><div className="section-kicker">CATEGORY BREAKDOWN</div><h3>Detections by object</h3></div><span className="panel-icon"><Boxes size={17} /></span></div>{summary?.category_counts?.length ? <div className="bar-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={summary.category_counts} margin={{ top: 10, right: 14, bottom: 10, left: -16 }}><CartesianGrid stroke="#e7dfd4" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="name" tickFormatter={titleCase} tick={{ fill: '#837b70', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#837b70', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: 'rgba(255, 252, 246, .96)', border: '1px solid #e4dbcd', borderRadius: 12, color: '#39352f', boxShadow: '0 12px 32px rgba(89, 72, 48, .12)' }} labelFormatter={titleCase} /><Area type="monotone" dataKey="count" stroke="#829db2" strokeWidth={2} fill="#829db2" fillOpacity={0.18} /></AreaChart></ResponsiveContainer></div> : <EmptyState icon={Boxes} title="No matching detections" message="Choose another job or category, or run a detection first." />}</section>
      <section className="panel chart-panel"><div className="panel-heading"><div><div className="section-kicker">JOB TIMELINE</div><h3>Detections by date</h3></div><span className="panel-icon"><Activity size={17} /></span></div>{summary?.detections_over_time?.some((item) => item.detections > 0) ? <div className="activity-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={summary.detections_over_time} margin={{ top: 12, right: 8, bottom: 2, left: -16 }}><defs><linearGradient id="analyticsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#829db2" stopOpacity={0.24} /><stop offset="95%" stopColor="#829db2" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#e7dfd4" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="date" tick={{ fill: '#837b70', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#837b70', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={{ background: 'rgba(255, 252, 246, .96)', border: '1px solid #e4dbcd', borderRadius: 12, color: '#39352f', boxShadow: '0 12px 32px rgba(89, 72, 48, .12)' }} /><Area type="monotone" dataKey="detections" stroke="#829db2" strokeWidth={2} fill="url(#analyticsFill)" /></AreaChart></ResponsiveContainer></div> : <EmptyState icon={Activity} title="Nothing to plot yet" message="Completed job activity will be grouped by its recorded date." />}</section></div>
    <section className="panel"><div className="panel-heading"><div><div className="section-kicker">REPORTS</div><h3>Download job data</h3></div><span className="panel-icon"><ArrowDownToLine size={17} /></span></div>{summary?.recent_jobs?.filter((job) => job.status === 'completed').length ? <div className="report-list">{summary.recent_jobs.filter((job) => job.status === 'completed').map((job) => <div className="report-row" key={job.id}><span className={`file-chip ${job.kind === 'video' ? 'video-chip' : ''}`}>{job.kind === 'video' ? <FileVideo2 size={15} /> : <FileImage size={15} />}</span><div><strong>{job.filename}</strong><small>{formatNumber(job.detections_count)} frame detections · {formatDate(job.created_at)}</small></div><DownloadButton path={job.report_url} className="button button-secondary"><ArrowDownToLine size={14} /> CSV</DownloadButton></div>)}</div> : <EmptyState icon={History} title="No reports available" message="Complete an analysis to generate downloadable CSV data." />}</section>
    <div className="analytics-note"><ShieldCheck size={15} /><span>Object counts represent model predictions per image or sampled video frame. Track totals are reported separately from frame-level detections.</span></div>
  </div>
}

function HistoryPage() {
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState('')
  const [details, setDetails] = useState({})
  const [retentionDays, setRetentionDays] = useState(30)
  const load = useCallback(async () => { setLoading(true); try { const { data } = await api.get('/jobs', { params: { limit: 100, ...(filter !== 'all' ? { kind: filter } : {}) } }); setJobs(data.jobs); setError('') } catch (failure) { setError(apiError(failure, 'Could not load detection history.')) } finally { setLoading(false) } }, [filter])
  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/settings').then(({ data }) => setRetentionDays(data.retention_days)).catch(() => {}) }, [])
  const openJob = async (job) => { if (expanded === job.id) { setExpanded(''); return } setExpanded(job.id); if (!details[job.id]) { try { const { data } = await api.get(`/jobs/${job.id}/detections`, { params: { limit: 100 } }); setDetails((current) => ({ ...current, [job.id]: data.detections })) } catch (failure) { setError(apiError(failure, 'Could not load job detections.')) } } }
  const remove = async (job) => { if (!window.confirm(`Delete “${job.filename}” and its stored result files?`)) return; try { await api.delete(`/jobs/${job.id}`); setJobs((current) => current.filter((entry) => entry.id !== job.id)); setError('') } catch (failure) { setError(apiError(failure, 'Could not delete this job.')) } }
  return <div className="page-stack"><div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> STORED JOBS</div><h2>Every run, in one place.</h2><p>Review real image and video jobs, open detections, and download their outputs.</p></div><button className="button button-secondary" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button></div>
    <ErrorNotice onDismiss={() => setError('')}>{error}</ErrorNotice>
    <section className="panel history-panel"><div className="panel-heading"><div><div className="section-kicker">DETECTION HISTORY</div><h3>{jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}</h3></div><div className="segmented-control"><button className={filter === 'all' ? 'segment-active' : ''} onClick={() => setFilter('all')}>All</button><button className={filter === 'image' ? 'segment-active' : ''} onClick={() => setFilter('image')}>Images</button><button className={filter === 'video' ? 'segment-active' : ''} onClick={() => setFilter('video')}>Videos</button></div></div>
      {loading ? (
        <div className="loading-state"><LoaderCircle size={19} className="spin" /> Loading your jobs…</div>
      ) : jobs.length > 0 ? (
        <div className="history-list">
          {jobs.map((job) => (
            <article key={job.id} className={`history-entry ${expanded === job.id ? 'history-entry-open' : ''}`}>
              <div className="history-row">
                <button className="history-main" onClick={() => openJob(job)}>
                  <span className={`file-chip ${job.kind === 'video' ? 'video-chip' : ''}`}>
                    {job.kind === 'video' ? <FileVideo2 size={16} /> : <FileImage size={16} />}
                  </span>
                  <span className="history-filename">
                    <strong>{job.filename}</strong>
                    <small>{titleCase(job.kind)} · {formatDate(job.created_at)} · {formatDuration(job.processing_time_seconds)}</small>
                  </span>
                  <StatusBadge status={job.status} />
                </button>
                <span className="history-count">{job.status === 'completed' ? formatNumber(job.detections_count) : '—'} <small>objects</small></span>
                <button className="icon-button" title="Delete job" onClick={() => remove(job)} disabled={job.status === 'processing'}><Trash2 size={16} /></button>
                <button className="icon-button expand-button" aria-label="Toggle job details" onClick={() => openJob(job)}><ChevronDown size={17} /></button>
              </div>
              {expanded === job.id && (
                <div className="history-detail">
                  <div className="history-detail-meta">
                    <span>Model <strong>{job.model}</strong></span>
                    <span>Confidence <strong>{job.confidence?.toFixed(2)}</strong></span>
                    {job.kind === 'video' && <span>Tracked objects <strong>{job.tracking ? job.unique_tracks : 'Tracking off'}</strong></span>}
                    <span>Categories <strong>{Object.entries(job.class_counts || {}).map(([name, count]) => `${titleCase(name)} ${count}`).join(' · ') || 'None'}</strong></span>
                  </div>
                  {job.status === 'failed' && <p className="inline-error">{job.error}</p>}
                  {job.status === 'processing' && <p className="muted-copy">This job is processing. Refresh the page to update its status.</p>}
                  {job.status === 'completed' && (
                    <div className="history-actions">
                      <DownloadButton className="button button-secondary" path={job.annotated_result_url}><ArrowDownToLine size={14} /> Result</DownloadButton>
                      <DownloadButton className="button button-secondary" path={job.report_url}><ArrowDownToLine size={14} /> CSV report</DownloadButton>
                    </div>
                  )}
                  {details[job.id]?.length > 0 && (
                    <div className="detection-preview-list">
                      {details[job.id].slice(0, 8).map((item, index) => (
                        <span key={index}>
                          {titleCase(item.class_name)} <strong>{(item.confidence * 100).toFixed(1)}%</strong>
                          {item.track_id != null && <small> ID {item.track_id}</small>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={History}
          title="History is ready for your first job"
          message="Once an image or video has been analyzed, its actual results will be stored here."
          action={<Link to="/images" className="text-link">Start with an image <ArrowRight size={14} /></Link>}
        />
      )}
    </section><div className="retention-note"><ShieldCheck size={15} /> Jobs and generated files are kept locally for {retentionDays} days, then eligible for cleanup in Settings.</div>
  </div>
}

function SettingsPage() {
  const [settings, setSettings] = useState(null)
  const [confidence, setConfidence] = useState(0.35)
  const [uploadLimit, setUploadLimit] = useState(250)
  const [saving, setSaving] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(() => api.get('/settings').then(({ data }) => { setSettings(data); setConfidence(data.confidence_threshold); setUploadLimit(data.max_upload_mb); setError('') }).catch((failure) => setError(apiError(failure, 'Could not load settings.'))), [])
  useEffect(() => { load() }, [load])
  const save = async (event) => { event.preventDefault(); setSaving(true); setMessage(''); setError(''); try { const { data } = await api.patch('/settings', { confidence_threshold: Number(confidence), max_upload_mb: Number(uploadLimit) }); setConfidence(data.confidence_threshold); setUploadLimit(data.max_upload_mb); setMessage('Settings saved for this workspace.') } catch (failure) { setError(apiError(failure, 'Could not save these settings.')) } finally { setSaving(false) } }
  const cleanup = async () => { if (!window.confirm(`Delete completed and failed jobs older than ${settings?.retention_days || 30} days and their files?`)) return; setCleaning(true); setMessage(''); setError(''); try { const { data } = await api.post('/settings/cleanup'); setMessage(`${data.deleted_jobs} expired ${data.deleted_jobs === 1 ? 'job was' : 'jobs were'} removed.`) } catch (failure) { setError(apiError(failure, 'Cleanup failed.')) } finally { setCleaning(false) } }
  const modelData = settings?.models
  const configuredModel = modelData?.models?.find((item) => item.configured)
  const modelReadiness = !modelData?.ultralytics_available
    ? 'Install the backend requirements'
    : modelData.weights_available
      ? modelData.model_loaded ? 'Model loaded and ready' : 'Weights available · model loads on first request'
      : configuredModel?.will_download ? 'Official default downloads on first request' : 'Install trusted model weights'
  return <div className="page-stack"><div className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> WORKSPACE CONFIGURATION</div><h2>Make it work your way.</h2><p>Set upload and detection defaults, and see which configured model features are ready.</p></div><span className="intro-badge"><Settings2 size={14} /> Saved to backend</span></div>
    <ErrorNotice onDismiss={() => setError('')}>{error}</ErrorNotice>{message && <div className="notice success-notice"><CheckCircle2 size={16} />{message}<button className="icon-button notice-dismiss" onClick={() => setMessage('')} aria-label="Dismiss message"><X size={15} /></button></div>}
    <div className="settings-grid"><form className="panel settings-form" onSubmit={save}><div className="panel-heading"><div><div className="section-kicker">PROCESSING DEFAULTS</div><h3>Detection preferences</h3></div><span className="panel-icon"><Settings2 size={17} /></span></div><ConfidenceControl value={confidence} onChange={setConfidence} /><label className="field-group"><span className="field-label">MAXIMUM UPLOAD SIZE <strong>{uploadLimit} MB</strong></span><div className="range-wrap"><span>1 MB</span><input type="range" min="1" max="2048" step="1" value={uploadLimit} onChange={(event) => setUploadLimit(Number(event.target.value))} /><span>2048 MB</span></div><small>New uploads larger than this are rejected by the API.</small></label><div className="settings-static"><span>Temporary file retention</span><strong>{settings?.retention_days || 30} days</strong></div><button className="button button-primary" disabled={saving}>{saving ? <><LoaderCircle size={15} className="spin" /> Saving…</> : <><Check size={15} /> Save preferences</>}</button></form>
      <section className="panel system-panel"><div className="panel-heading"><div><div className="section-kicker">SYSTEM STATUS</div><h3>Models & runtime</h3></div><span className="panel-icon"><Cpu size={17} /></span></div><div className="system-status-row"><span className={`system-status-icon ${modelData?.ultralytics_available ? 'system-ready' : 'system-unavailable'}`}>{modelData?.ultralytics_available ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span><span><strong>Ultralytics runtime</strong><small>{modelData?.ultralytics_available ? 'Installed and available to the API' : 'Unavailable · install backend requirements'}</small></span></div><div className="system-status-row"><span className={`system-status-icon ${modelData?.ultralytics_available && (modelData?.weights_available || configuredModel?.will_download) ? 'system-ready' : 'system-unavailable'}`}>{modelData?.ultralytics_available && (modelData?.weights_available || configuredModel?.will_download) ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span><span><strong>Inference readiness</strong><small>{modelReadiness} · {modelData?.device || 'device not detected'} · {modelData?.image_size || 960}px</small></span></div><div className="model-list-heading">AVAILABLE WEIGHTS <span>{modelData?.models?.length || 0}</span></div>{modelData?.models?.length ? modelData.models.map((item) => <div className="model-list-item" key={item.name}><span className="model-file-icon"><Cpu size={15} /></span><span><strong>{item.name}</strong><small>{item.name === 'yolov8s.pt' ? 'Higher COCO accuracy · slower CPU' : item.available ? 'Local weights' : item.will_download ? 'Downloads from Ultralytics on first use' : 'Weights not installed'}</small></span>{item.configured && <span className="default-tag">DEFAULT</span>}<span className={`model-status-dot ${item.available || item.will_download ? 'model-status-ready' : ''}`} /></div>) : <p className="muted-copy">Model details become available when the backend is connected.</p>}<div className="enhancement-status"><span className="enhance-icon"><Sparkles size={16} /></span><span><strong>Optional image enhancement</strong><small>{settings?.enhancement?.message || 'Checking Real-ESRGAN availability…'}</small></span><span className={`enhancement-tag ${settings?.enhancement?.available ? 'available-tag' : ''}`}>{settings?.enhancement?.available ? 'READY' : 'OPTIONAL'}</span></div></section></div>
    <section className="panel format-panel"><div className="panel-heading"><div><div className="section-kicker">INPUT SUPPORT</div><h3>Supported media formats</h3></div><span className="panel-icon"><FileImage size={17} /></span></div><div className="format-group"><div className="format-icon"><FileImage size={17} /></div><div><strong>Images</strong><span>{(settings?.supported_image_formats || ['.jpg', '.jpeg', '.png', '.webp']).join(' · ')}</span></div></div><div className="format-group"><div className="format-icon video-format"><FileVideo2 size={17} /></div><div><strong>Videos</strong><span>{(settings?.supported_video_formats || ['.mp4', '.avi', '.mov', '.mkv']).join(' · ')}</span></div></div></section>
    <section className="panel cleanup-panel"><div className="cleanup-copy"><span className="cleanup-icon"><Trash2 size={17} /></span><div><strong>Clear expired job files</strong><p>Remove completed and failed jobs older than the configured retention period. Active jobs are kept.</p></div></div><button className="button button-danger" onClick={cleanup} disabled={cleaning}>{cleaning ? <><LoaderCircle size={14} className="spin" /> Cleaning…</> : <><Trash2 size={14} /> Clean expired files</>}</button></section>
    <div className="limits-note"><ShieldCheck size={15} /><span>AI Road Vision is an educational computer-vision tool. Model predictions can fail in darkness, rain, fog, and occlusion; they are not suitable for controlling a real vehicle.</span></div>
  </div>
}

function NotFoundPage() {
  return <div className="not-found"><span className="empty-icon"><ScanLine size={23} /></span><h2>That route isn't mapped.</h2><p>Use the workspace navigation to get back to your analysis.</p><Link to="/" className="button button-primary">Go to overview</Link></div>
}

function WorkspaceRoutes({ authEnabled, onLogout }) {
  return <Routes><Route element={<AppLayout authEnabled={authEnabled} onLogout={onLogout} />}><Route index element={<OverviewPage />} /><Route path="images" element={<ImagePage />} /><Route path="videos" element={<VideoPage />} /><Route path="analytics" element={<AnalyticsPage />} /><Route path="history" element={<HistoryPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes>
}

function LoginScreen({ onSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/auth/login', { username, password })
      onSuccess(data.access_token)
    } catch (failure) {
      setError(apiError(failure, 'Sign-in failed. Check your credentials and try again.'))
    } finally {
      setBusy(false)
    }
  }
  return <main className="auth-screen"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><Crosshair size={22} strokeWidth={2.4} /></span><span className="brand-copy"><strong>road<span>vision</span></strong><small>COMPUTER VISION PLATFORM</small></span></div><div className="eyebrow"><span className="eyebrow-line" /> PRIVATE WORKSPACE</div><h1>Welcome back.</h1><p>Sign in to access your road analysis workspace.</p>{error && <div className="notice error-notice auth-error"><AlertTriangle size={16} /><span>{error}</span></div>}<form className="auth-form" onSubmit={submit}><label>Username<input name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={128} /></label><label>Password<input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} /></label><button className="button button-primary auth-submit" disabled={busy}>{busy ? <><LoaderCircle size={16} className="spin" /> Signing in…</> : <><ShieldCheck size={16} /> Sign in securely</>}</button></form><div className="auth-footnote"><ShieldCheck size={14} /> Your session is private to this browser and expires after 12 hours.</div></section></main>
}

function AuthGate() {
  const [view, setView] = useState('checking')
  const [authEnabled, setAuthEnabled] = useState(false)
  const [startupError, setStartupError] = useState('')
  const initialize = useCallback(async () => {
    setView('checking')
    setStartupError('')
    try {
      const { data } = await api.get('/auth/status')
      if (!data.enabled) {
        window.sessionStorage.removeItem(AUTH_TOKEN_KEY)
        setAuthEnabled(false)
        setView('ready')
        return
      }
      setAuthEnabled(true)
      if (window.sessionStorage.getItem(AUTH_TOKEN_KEY)) {
        await api.get('/auth/session')
        setView('ready')
      } else {
        setView('login')
      }
    } catch (failure) {
      if (failure.response?.status === 401) {
        setAuthEnabled(true)
        setView('login')
      } else {
        setStartupError(apiError(failure, 'The API could not be reached. Check the backend URL and try again.'))
        setView('error')
      }
    }
  }, [])
  useEffect(() => {
    initialize()
    const onExpired = () => {
      window.sessionStorage.removeItem(AUTH_TOKEN_KEY)
      setAuthEnabled(true)
      setView('login')
    }
    window.addEventListener('roadvision-auth-expired', onExpired)
    return () => window.removeEventListener('roadvision-auth-expired', onExpired)
  }, [initialize])
  const onSuccess = (token) => {
    window.sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    setAuthEnabled(true)
    setView('ready')
  }
  const onLogout = () => {
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY)
    setAuthEnabled(true)
    setView('login')
  }
  if (view === 'ready') return <WorkspaceRoutes authEnabled={authEnabled} onLogout={onLogout} />
  if (view === 'login') return <LoginScreen onSuccess={onSuccess} />
  if (view === 'error') return <main className="auth-screen"><section className="auth-card auth-unavailable"><span className="auth-status-icon"><AlertTriangle size={22} /></span><h1>Workspace unavailable.</h1><p>{startupError}</p><button className="button button-primary auth-submit" onClick={initialize}><RefreshCw size={15} /> Retry connection</button></section></main>
  return <main className="auth-screen"><section className="auth-card auth-loading"><LoaderCircle size={22} className="spin" /><span>Connecting to your workspace…</span></section></main>
}

export default function App() {
  return <AuthGate />
}
