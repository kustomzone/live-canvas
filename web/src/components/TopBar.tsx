import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from '../styles/TopBar.module.css';
import type { Node } from '../state/types';
import { useLang, t, displayTopic } from '../lib/i18n';
import { useTheme, nextThemePref } from '../lib/theme';
import { Icon } from './Icon';
import { selectionFromClipboard, selectionFromFileList, type ImageSelection } from '../lib/imageUpload';
import { voicePreviewUrl, type Voice } from '../lib/api';
import { useIsMobile } from '../hooks/useIsMobile';
import { BottomSheet } from './BottomSheet';
import { BreadcrumbNav } from './BreadcrumbNav';
import { exportChrome } from '../lib/exportProfile';

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
  onToggleEditMode: () => void;
  onToggleWebSearch: () => void;
  onToggleAutoNarrate: () => void;
  onSelectVoice: (voice: string | null) => void;
  onToggleComposeOnClick: () => void;
  onToggleOrientation: () => void;
  onRegenerate?: () => void;
  onExportPreview?: () => void;
  // Attachment for new-canvas creation. Picked / pasted in the address bar.
  attachment: ImageSelection | null;
  onAttachmentChange: (sel: ImageSelection | null) => void;
  fullscreen: boolean;
  showChrome: boolean;
  showLabels: boolean;
  editMode: boolean;
  webSearch: boolean;
  autoNarrate: boolean;
  voiceStyle: string | null;
  voices: Voice[];
  voiceEnabled: boolean;
  composeOnClick: boolean;
  orientation: 'landscape' | 'portrait';
  readOnly: boolean;
  busy: boolean;
};

export function TopBar(props: Props) {
  const {
    view, topic, currentNode, draftTopic, onDraftTopicChange, onSubmitTopic,
    onBackToGallery, onJumpBreadcrumb, onShare, onToggleFullscreen, onToggleChrome,
    onToggleLabels, onToggleWebSearch, onToggleComposeOnClick, onToggleOrientation, onRegenerate,
    onToggleAutoNarrate, onSelectVoice,
    onExportPreview,
    attachment, onAttachmentChange,
    fullscreen, showChrome, showLabels, editMode, webSearch, autoNarrate, voiceStyle, voices, voiceEnabled, composeOnClick, orientation, readOnly, busy,
  } = props;

  const [lang, setLang] = useLang();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || readOnly) return;
    if (view === 'gallery' && (draftTopic.trim() || attachment)) {
      onSubmitTopic();
    }
  };

  // Paste-to-attach is scoped to the address input only (per the user's
  // explicit constraint). We attach onPaste directly to the <input>, then
  // walk the clipboard for image items.
  const onInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const sel = selectionFromClipboard(e);
    if (sel) {
      e.preventDefault();
      onAttachmentChange(sel);
    }
    // Otherwise let the browser do its default text paste.
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sel = selectionFromFileList(e.target.files);
    if (sel) {
      onAttachmentChange(sel);
      // Defer focus to the next frame: focusing synchronously inside the
      // file-input change handler can stall the picker teardown. rAF lets
      // the input dialog fully close first, then we move the caret to the
      // topic field so the user can type / submit immediately.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // Reset so the same file can be picked again after removal.
    e.target.value = '';
  };

  const path = currentNode?.path ?? [];

  return (
    <div className={`${styles.topbar} ${fullscreen ? styles.compact : ''}`}>
      <div className={styles.dots}><span /><span /><span /></div>

      {exportChrome.showBackToGallery && !fullscreen && (
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
              ref={inputRef}
              type="text"
              className={styles.addressInput}
              placeholder={t('topbar.placeholder', lang)}
              value={draftTopic}
              onChange={(e) => onDraftTopicChange(e.target.value)}
              onPaste={onInputPaste}
            />
            {attachment && (
              <span className={styles.attachThumbWrap} title={attachment.file.name || 'image'}>
                <img src={attachment.previewUrl} alt="" className={styles.attachThumb} />
                <button
                  type="button"
                  className={styles.attachThumbRemove}
                  aria-label={t('topbar.attach.remove', lang)}
                  onClick={(e) => { e.preventDefault(); onAttachmentChange(null); }}
                ><Icon name="close" size={10} strokeWidth={2.5} /></button>
              </span>
            )}
            <button
              type="button"
              className={styles.attachBtn}
              title={t('topbar.attach', lang)}
              aria-label={t('topbar.attach', lang)}
              onClick={(e) => { e.preventDefault(); fileRef.current?.click(); }}
            ><Icon name="attach" size={14} /></button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onFilePicked}
            />
          </>
        )}

        {view === 'canvas' && currentNode && (
          <BreadcrumbNav path={path} lang={lang} onJump={onJumpBreadcrumb} />
        )}

        {view === 'canvas' && !currentNode && topic && (
          <span className={styles.crumb}>{displayTopic(topic, lang)}</span>
        )}

        {view === 'gallery' && (
          <button
            className={styles.submit}
            type="submit"
            disabled={(!draftTopic.trim() && !attachment) || busy}
          >
            {busy ? '…' : t('topbar.generate', lang)}
          </button>
        )}
      </form>

      {/* Right-side icon cluster — primary actions inline, secondary in More dropdown */}
      <div className={styles.rightCluster}>
        {exportChrome.showShare && view === 'canvas' && !readOnly && (
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
        {exportChrome.narrateInTopBar && view === 'canvas' && voiceEnabled && (
          <button
            type="button"
            className={`${styles.miniBtn} ${autoNarrate ? styles.miniBtnOn : ''}`}
            onClick={onToggleAutoNarrate}
            title={t('topbar.narrate', lang)}
            aria-label={t('topbar.narrate', lang)}
            aria-pressed={autoNarrate}
          ><Icon name={autoNarrate ? 'narrate' : 'narrate-off'} size={14} /></button>
        )}
        {exportChrome.labelsInTopBar && view === 'canvas' && (
          <button
            type="button"
            className={`${styles.miniBtn} ${showLabels ? styles.miniBtnOn : ''}`}
            onClick={onToggleLabels}
            title={showLabels ? t('topbar.labels.hide', lang) : t('topbar.labels.show', lang)}
            aria-label={showLabels ? t('topbar.labels.hide', lang) : t('topbar.labels.show', lang)}
            aria-pressed={showLabels}
          ><Icon name={showLabels ? 'tag-on' : 'tag-off'} size={14} /></button>
        )}
        {exportChrome.githubInTopBar && (
          <a
            className={styles.miniBtn}
            href="https://github.com/imcuttle/flipbook-app"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub"
            aria-label="GitHub"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
        )}
        {exportChrome.showMoreMenu && (
        <MoreMenu
          lang={lang}
          setLang={setLang}
          onToggleWebSearch={!readOnly ? onToggleWebSearch : undefined}
          // Auto-narrate is a global playback preference — offered on the
          // canvas view (where narration actually plays), even in read-only.
          onToggleAutoNarrate={view === 'canvas' ? onToggleAutoNarrate : undefined}
          // Voice picker: offered when the server has narration enabled. On the
          // gallery it sets the create-time default; on the canvas it changes
          // the current book's voice (re-synthesises all node audio). Hidden in
          // read-only preview (no authoring) and when audio is disabled.
          onSelectVoice={voiceEnabled && !readOnly ? onSelectVoice : undefined}
          voiceStyle={voiceStyle}
          voices={voices}
          onToggleLabels={view === 'canvas' ? onToggleLabels : undefined}
          // Edit mode is canvas-only and never offered in read-only preview.
          // TEMPORARILY HIDDEN: pass undefined so the menu item doesn't render.
          // Re-enable by restoring the gated expression below.
          onToggleEditMode={undefined}
          // onToggleEditMode={view === 'canvas' && !readOnly && currentNode ? onToggleEditMode : undefined}
          onToggleComposeOnClick={view === 'canvas' && !readOnly ? onToggleComposeOnClick : undefined}
          // Orientation is fixed once a canvas exists, so only offer the
          // toggle on the gallery (before creating the next canvas).
          onToggleOrientation={view === 'gallery' && !readOnly ? onToggleOrientation : undefined}
          orientation={orientation}
          onRegenerate={view === 'canvas' && !readOnly && currentNode ? onRegenerate : undefined}
          onExportPreview={view === 'canvas' && currentNode ? onExportPreview : undefined}
          regenerateInfo={view === 'canvas' && currentNode ? {
            // Faithful to inputs: topic only if the user actually typed one
            // (root node records user_topic; null for image-only). Child
            // nodes have no topic input.
            userTopic: currentNode.gen_inputs?.user_topic ?? null,
            clickLabel: currentNode.gen_inputs?.user_label ?? null,
            clickXY: currentNode.gen_inputs?.click_xy ?? null,
            seedImageUrl: currentNode.seed_image_url
              ?? (currentNode.gen_inputs?.seed_image ? null : null),
          } : null}
          webSearch={webSearch}
          autoNarrate={autoNarrate}
          showLabels={showLabels}
          editMode={editMode}
          composeOnClick={composeOnClick}
        />
        )}
      </div>
    </div>
  );
}

// More-menu — collapses lower-priority toggles into a kebab dropdown so
// the right cluster stays compact as features accrue.
type RegenerateInfo = {
  userTopic: string | null;
  clickLabel: string | null;
  clickXY: [number, number] | null;
  seedImageUrl: string | null;
};

type MoreMenuProps = {
  lang: 'zh' | 'en';
  setLang: (l: 'zh' | 'en') => void;
  onToggleWebSearch?: () => void;
  onToggleAutoNarrate?: () => void;
  onSelectVoice?: (voice: string | null) => void;
  voiceStyle?: string | null;
  voices?: Voice[];
  onToggleLabels?: () => void;
  onToggleEditMode?: () => void;
  onToggleComposeOnClick?: () => void;
  onToggleOrientation?: () => void;
  onRegenerate?: () => void;
  onExportPreview?: () => void;
  regenerateInfo?: RegenerateInfo | null;
  webSearch: boolean;
  autoNarrate: boolean;
  showLabels: boolean;
  editMode: boolean;
  composeOnClick: boolean;
  orientation: 'landscape' | 'portrait';
};

function MoreMenu({
  lang, setLang,
  onToggleWebSearch, onToggleLabels, onToggleComposeOnClick, onToggleOrientation, onRegenerate, regenerateInfo,
  onExportPreview, onToggleEditMode, onToggleAutoNarrate,
  onSelectVoice, voiceStyle, voices,
  webSearch, autoNarrate, showLabels, editMode, composeOnClick, orientation,
}: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  // Voice submenu expansion (the moods are listed inline under the row).
  const [voiceOpen, setVoiceOpen] = useState(false);
  // 试听: which style is currently previewing, plus a single shared <audio>.
  // Only one sample plays at a time; clicking another style switches to it.
  const [previewStyle, setPreviewStyle] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  // Theme preference (system / light / dark). Toggled inline; keeping the
  // menu open lets the user cycle and watch the palette change live.
  const { pref: themePref, setPref: setThemePref } = useTheme();
  // Lightbox for viewing the seed image full-size from the regenerate info.
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Only the desktop dropdown uses outside-click-to-close. On mobile the
    // menu renders in a BottomSheet portaled to <body> — its buttons live
    // OUTSIDE wrapRef, so this handler would treat a tap on a menu item as
    // an "outside" click and close the sheet on mousedown BEFORE the
    // button's click fires (making items unresponsive). The BottomSheet
    // has its own backdrop dismissal, so skip this entirely on mobile.
    if (isMobile) {
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    const onDown = (e: MouseEvent) => {
      // Cast via the global DOM Node — the local `Node` import shadows it
      // (we imported it from state/types for breadcrumb props).
      if (!wrapRef.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, isMobile]);

  // 试听 controls. Each preview plays a server-synthesised welcome sample in
  // the chosen mood. We reuse one Audio element; switching styles or closing
  // the submenu stops whatever's playing.
  const stopPreview = () => {
    const a = previewAudioRef.current;
    if (a) { a.pause(); previewAudioRef.current = null; }
    setPreviewStyle(null);
  };
  const togglePreview = (style: string) => {
    if (previewStyle === style) { stopPreview(); return; }
    stopPreview();
    const a = new Audio(voicePreviewUrl(style, lang));
    a.addEventListener('ended', () => { setPreviewStyle((s) => (s === style ? null : s)); });
    a.addEventListener('error', () => { setPreviewStyle((s) => (s === style ? null : s)); });
    previewAudioRef.current = a;
    setPreviewStyle(style);
    a.play().catch(() => setPreviewStyle((s) => (s === style ? null : s)));
  };
  // Stop playback when the submenu collapses or the menu/component unmounts.
  useEffect(() => { if (!voiceOpen) stopPreview(); }, [voiceOpen]);
  useEffect(() => () => { previewAudioRef.current?.pause(); }, []);

  // Shared menu rows — rendered into the desktop dropdown or the mobile
  // bottom sheet depending on viewport.
  const menuItems = (
    <>
      {onExportPreview && (
        <button
          type="button"
          className={styles.moreItem}
          role="menuitem"
          onClick={() => { onExportPreview(); setOpen(false); }}
        >
          <Icon name="download" size={14} />
          <span className={styles.moreItemLabel}>{t('topbar.export', lang)}</span>
        </button>
      )}
      {onRegenerate && (
        <>
          <button
            type="button"
            className={styles.moreItem}
            role="menuitem"
            onClick={() => { onRegenerate(); setOpen(false); }}
          >
            <Icon name="regenerate" size={14} />
            <span className={styles.moreItemLabel}>{t('topbar.regenerate', lang)}</span>
            {regenerateInfo && !isMobile
              && (regenerateInfo.userTopic || regenerateInfo.clickLabel
                || regenerateInfo.clickXY || regenerateInfo.seedImageUrl) && (
              <span
                className={styles.moreInfo}
                role="img"
                aria-label={t('topbar.regenerate.info', lang)}
                tabIndex={0}
                onClick={(e) => e.stopPropagation()}
              >
                <Icon name="info" size={12} />
                <span className={styles.moreInfoPop} role="tooltip">
                  {regenerateInfo.userTopic && (
                    <span className={styles.moreInfoRow}>
                      <span className={styles.moreInfoKey}>{t('topbar.regenerate.input.topic', lang)}</span>
                      <span className={styles.moreInfoVal}>{regenerateInfo.userTopic}</span>
                    </span>
                  )}
                  {regenerateInfo.clickLabel && (
                    <span className={styles.moreInfoRow}>
                      <span className={styles.moreInfoKey}>{t('topbar.regenerate.input.label', lang)}</span>
                      <span className={styles.moreInfoVal}>{regenerateInfo.clickLabel}</span>
                    </span>
                  )}
                  {regenerateInfo.clickXY && (
                    <span className={styles.moreInfoRow}>
                      <span className={styles.moreInfoKey}>{t('topbar.regenerate.input.click', lang)}</span>
                      <span className={styles.moreInfoVal}>
                        {regenerateInfo.clickXY[0].toFixed(2)}, {regenerateInfo.clickXY[1].toFixed(2)}
                      </span>
                    </span>
                  )}
                  {regenerateInfo.seedImageUrl && (
                    <span className={styles.moreInfoRow}>
                      <span className={styles.moreInfoKey}>{t('topbar.regenerate.input.image', lang)}</span>
                      <img
                        src={regenerateInfo.seedImageUrl}
                        alt=""
                        className={styles.moreInfoThumb}
                        onClick={(e) => { e.stopPropagation(); setLightboxUrl(regenerateInfo.seedImageUrl); }}
                      />
                    </span>
                  )}
                </span>
              </span>
            )}
          </button>
          <div className={styles.moreSep} aria-hidden />
        </>
      )}
      {onToggleComposeOnClick && (
        <button
          type="button"
          className={`${styles.moreItem} ${composeOnClick ? styles.moreItemOn : ''}`}
          role="menuitemcheckbox"
          aria-checked={composeOnClick}
          onClick={() => { onToggleComposeOnClick(); setOpen(false); }}
        >
          {/* Icon stays constant — on/off is shown by the row's tint
              + ◆ marker, not by swapping glyphs. */}
          <Icon name="long-press" size={14} />
          <span className={styles.moreItemLabel}>{t('topbar.compose-on-click', lang)}</span>
          <span className={styles.moreItemState} aria-hidden>
            {composeOnClick ? <Icon name="current" size={10} /> : null}
          </span>
        </button>
      )}
      {onToggleOrientation && (
        <button
          type="button"
          className={styles.moreItem}
          role="menuitem"
          onClick={() => { onToggleOrientation(); setOpen(false); }}
        >
          <Icon name={orientation === 'portrait' ? 'orient-portrait' : 'orient-landscape'} size={14} />
          <span className={styles.moreItemLabel}>{t('topbar.orientation', lang)}</span>
          <span className={styles.moreItemStateText} aria-hidden>
            {t(orientation === 'portrait' ? 'topbar.orientation.portrait' : 'topbar.orientation.landscape', lang)}
          </span>
        </button>
      )}
      {onToggleWebSearch && (
        <button
          type="button"
          className={`${styles.moreItem} ${webSearch ? styles.moreItemOn : ''}`}
          role="menuitemcheckbox"
          aria-checked={webSearch}
          onClick={() => { onToggleWebSearch(); setOpen(false); }}
        >
          <Icon name="web-on" size={14} />
          <span className={styles.moreItemLabel}>{t('topbar.web', lang)}</span>
          <span className={styles.moreItemState} aria-hidden>
            {webSearch ? <Icon name="current" size={10} /> : null}
          </span>
        </button>
      )}
      {onToggleAutoNarrate && (
        <button
          type="button"
          className={`${styles.moreItem} ${autoNarrate ? styles.moreItemOn : ''}`}
          role="menuitemcheckbox"
          aria-checked={autoNarrate}
          onClick={() => { onToggleAutoNarrate(); setOpen(false); }}
        >
          <Icon name="narrate" size={14} />
          <span className={styles.moreItemLabel}>{t('topbar.narrate', lang)}</span>
          <span className={styles.moreItemState} aria-hidden>
            {autoNarrate ? <Icon name="current" size={10} /> : null}
          </span>
        </button>
      )}
      {onSelectVoice && (
        <>
          <button
            type="button"
            className={styles.moreItem}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={voiceOpen}
            onClick={() => setVoiceOpen((v) => !v)}
          >
            <Icon name="narrate" size={14} />
            <span className={styles.moreItemLabel}>{t('topbar.voice', lang)}</span>
            <span className={styles.moreItemStateText} aria-hidden>
              {voices?.find((v) => v.shortName === voiceStyle)?.displayName ?? t('voice.default', lang)}
            </span>
          </button>
          {voiceOpen && (
            <div className={styles.voiceSubmenu} role="group">
              {(voices ?? []).map((v) => {
                const selected = voiceStyle === v.shortName;
                const previewing = previewStyle === v.shortName;
                return (
                  <div key={v.shortName} className={styles.voiceRow}>
                    <button
                      type="button"
                      className={`${styles.moreItem} ${styles.voiceItem} ${selected ? styles.moreItemOn : ''}`}
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => { onSelectVoice(v.shortName); setVoiceOpen(false); setOpen(false); }}
                    >
                      <span className={styles.moreItemLabel}>{v.displayName}</span>
                      <span className={styles.moreItemState} aria-hidden>
                        {selected ? <Icon name="current" size={10} /> : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.voicePreviewBtn}
                      aria-label={t(previewing ? 'voice.preview.stop' : 'voice.preview', lang)}
                      title={t(previewing ? 'voice.preview.stop' : 'voice.preview', lang)}
                      onClick={(e) => { e.stopPropagation(); togglePreview(v.shortName); }}
                    >
                      <Icon name={previewing ? 'stop' : 'play'} size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {onToggleLabels && (
        <button
          type="button"
          className={`${styles.moreItem} ${showLabels ? styles.moreItemOn : ''}`}
          role="menuitemcheckbox"
          aria-checked={showLabels}
          onClick={() => { onToggleLabels(); setOpen(false); }}
        >
          <Icon name="tag-on" size={14} />
          <span className={styles.moreItemLabel}>{t('topbar.labels', lang)}</span>
          <span className={styles.moreItemState} aria-hidden>
            {showLabels ? <Icon name="current" size={10} /> : null}
          </span>
        </button>
      )}
      {onToggleEditMode && (
        <button
          type="button"
          className={`${styles.moreItem} ${editMode ? styles.moreItemOn : ''}`}
          role="menuitemcheckbox"
          aria-checked={editMode}
          onClick={() => { onToggleEditMode(); setOpen(false); }}
        >
          <Icon name="edit" size={14} />
          <span className={styles.moreItemLabel}>{t('topbar.edit-mode', lang)}</span>
          <span className={styles.moreItemState} aria-hidden>
            {editMode ? <Icon name="current" size={10} /> : null}
          </span>
        </button>
      )}
      <button
        type="button"
        className={styles.moreItem}
        role="menuitem"
        onClick={() => { setLang(lang === 'zh' ? 'en' : 'zh'); setOpen(false); }}
      >
        <span className={styles.langInline}>{lang === 'zh' ? '中' : 'EN'}</span>
        <span className={styles.moreItemLabel}>{t('topbar.lang.zh', lang)}</span>
        <span className={styles.moreItemStateText} aria-hidden>
          {lang === 'zh' ? 'English' : '中文'}
        </span>
      </button>
      {/* Theme cycle: system → light → dark → system. The icon reflects the
          current preference; the trailing text names it. (The export build
          hides the More menu, but still auto-follows the system theme.) */}
      <button
        type="button"
        className={styles.moreItem}
        role="menuitem"
        onClick={() => { setThemePref(nextThemePref(themePref)); }}
      >
        <Icon
          name={themePref === 'system' ? 'theme-system' : themePref === 'light' ? 'theme-light' : 'theme-dark'}
          size={14}
        />
        <span className={styles.moreItemLabel}>{t('topbar.theme', lang)}</span>
        <span className={styles.moreItemStateText} aria-hidden>
          {t(themePref === 'system' ? 'topbar.theme.system' : themePref === 'light' ? 'topbar.theme.light' : 'topbar.theme.dark', lang)}
        </span>
      </button>
      <a
        className={styles.moreItem}
        role="menuitem"
        href="https://github.com/imcuttle/flipbook-app"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setOpen(false)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <span className={styles.moreItemLabel}>GitHub</span>
      </a>
    </>
  );

  return (
    <div ref={wrapRef} className={styles.moreWrap}>
      <button
        type="button"
        className={styles.miniBtn}
        onClick={() => setOpen((v) => !v)}
        title={t('topbar.more', lang)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('topbar.more', lang)}
      ><Icon name="more" size={14} /></button>
      {open && !isMobile && (
        <div className={styles.moreMenu} role="menu">
          {menuItems}
        </div>
      )}
      {isMobile && (
        <BottomSheet open={open} onClose={() => setOpen(false)} title={t('topbar.more', lang)}>
          <div className={styles.moreSheetList} role="menu">
            {menuItems}
          </div>
        </BottomSheet>
      )}
      {lightboxUrl && createPortal(
        <div className={styles.lightbox} onClick={() => setLightboxUrl(null)} role="presentation">
          <img src={lightboxUrl} alt="" className={styles.lightboxImg} />
        </div>,
        document.body,
      )}
    </div>
  );
}
