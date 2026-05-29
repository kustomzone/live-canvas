import styles from '../styles/TopBar.module.css';
import type { Node } from '../state/types';
import { useLang, t } from '../lib/i18n';
import { Icon } from './Icon';

type Props = {
  view: 'gallery' | 'canvas';
  topic: string | null;
  currentNode: Node | null;
  draftTopic: string;
  onDraftTopicChange: (v: string) => void;
  onSubmitTopic: () => void;
  onBackToGallery: () => void;
  onJumpBreadcrumb: (hash: string) => void;
  onShare: () => void;
  onToggleFullscreen: () => void;
  onToggleChrome: () => void;
  onToggleLabels: () => void;
  onToggleWebSearch: () => void;
  fullscreen: boolean;
  showChrome: boolean;
  showLabels: boolean;
  webSearch: boolean;
  readOnly: boolean;
  busy: boolean;
};

export function TopBar(props: Props) {
  const {
    view, topic, currentNode, draftTopic, onDraftTopicChange, onSubmitTopic,
    onBackToGallery, onJumpBreadcrumb, onShare, onToggleFullscreen, onToggleChrome,
    onToggleLabels, onToggleWebSearch,
    fullscreen, showChrome, showLabels, webSearch, readOnly, busy,
  } = props;

  const [lang, setLang] = useLang();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || readOnly) return;
    if (view === 'gallery' && draftTopic.trim()) {
      onSubmitTopic();
    }
  };

  const path = currentNode?.path ?? [];

  return (
    <div className={`${styles.topbar} ${fullscreen ? styles.compact : ''}`}>
      <div className={styles.dots}><span /><span /><span /></div>

      {!fullscreen && (
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onBackToGallery}
          title={t('topbar.gallery.tip', lang)}
          aria-label={t('topbar.gallery', lang)}
        >
          <span className={styles.iconLabel}><Icon name="menu" size={14} /></span>
          <span className={styles.btnText}>{t('topbar.gallery', lang)}</span>
        </button>
      )}

      {/* Address-bar capsule */}
      <form className={styles.address} onSubmit={onSubmit}>
        {view === 'gallery' && (
          <>
            <span className={styles.modeTag}>{t('topbar.new', lang)}</span>
            <input
              type="text"
              className={styles.addressInput}
              placeholder={t('topbar.placeholder', lang)}
              value={draftTopic}
              onChange={(e) => onDraftTopicChange(e.target.value)}
            />
          </>
        )}

        {view === 'canvas' && currentNode && (
          <div className={styles.breadcrumb} aria-label="Path">
            {path.map((p, i) => {
              const isLast = i === path.length - 1;
              return (
                <span key={p.hash} className={styles.crumbWrap}>
                  {i > 0 && <span className={styles.crumbSep}>›</span>}
                  <button
                    type="button"
                    className={`${styles.crumb} ${isLast ? styles.crumbCurrent : ''}`}
                    onClick={() => !isLast && onJumpBreadcrumb(p.hash)}
                    disabled={isLast}
                    title={p.title}
                  >
                    {p.title}
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {view === 'canvas' && !currentNode && topic && (
          <span className={styles.crumb}>{topic}</span>
        )}

        {view === 'gallery' && (
          <button
            className={styles.submit}
            type="submit"
            disabled={!draftTopic.trim() || busy}
          >
            {busy ? '…' : t('topbar.generate', lang)}
          </button>
        )}
      </form>

      {/* Right-side icon cluster — always mini */}
      <div className={styles.rightCluster}>
        <button
          type="button"
          className={styles.miniBtn}
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          title={t('topbar.lang.zh', lang)}
          aria-label="Switch language"
        ><span className={styles.langText}>{lang === 'zh' ? 'EN' : '中'}</span></button>
        {!readOnly && (
          <button
            type="button"
            className={styles.miniBtn}
            onClick={onToggleWebSearch}
            title={webSearch ? t('topbar.web.on', lang) : t('topbar.web.off', lang)}
            aria-label="Toggle web search"
            aria-pressed={!webSearch}
            style={!webSearch ? { opacity: 0.6 } : undefined}
          ><Icon name={webSearch ? 'web-on' : 'web-off'} size={14} /></button>
        )}
        {view === 'canvas' && !readOnly && (
          <button
            type="button"
            className={styles.miniBtn}
            onClick={onShare}
            title={t('topbar.share', lang)}
            aria-label="Share"
          ><Icon name="share" size={14} /></button>
        )}
        {view === 'canvas' && (
          <button
            type="button"
            className={styles.miniBtn}
            onClick={onToggleLabels}
            title={showLabels ? t('topbar.labels.hide', lang) : t('topbar.labels.show', lang)}
            aria-label="Toggle labels"
            aria-pressed={!showLabels}
            style={!showLabels ? { opacity: 0.6 } : undefined}
          ><Icon name={showLabels ? 'tag-on' : 'tag-off'} size={14} /></button>
        )}
        {view === 'canvas' && (
          <button
            type="button"
            className={styles.miniBtn}
            onClick={onToggleFullscreen}
            title={fullscreen ? t('topbar.fullscreen.exit', lang) : t('topbar.fullscreen.enter', lang)}
            aria-label="Fullscreen"
          ><Icon name={fullscreen ? 'fullscreen-exit' : 'fullscreen-enter'} size={14} /></button>
        )}
        {view === 'canvas' && fullscreen && (
          <button
            type="button"
            className={styles.miniBtn}
            onClick={onToggleChrome}
            title={t('topbar.chrome.toggle', lang)}
            aria-label="Toggle chrome"
          ><Icon name={showChrome ? 'eye' : 'eye-off'} size={14} /></button>
        )}
      </div>
    </div>
  );
}
