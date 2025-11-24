const SCHEDULE_ALERT_WINDOW_MINUTES = 10;
const SCHEDULE_ALERT_INTERVAL_MS = 30000;
const WEEKDAY_OPTIONS = [
  { value: 'domingo', label: 'Domingo' },
  { value: 'segunda', label: 'Segunda-feira' },
  { value: 'terca', label: 'Terça-feira' },
  { value: 'quarta', label: 'Quarta-feira' },
  { value: 'quinta', label: 'Quinta-feira' },
  { value: 'sexta', label: 'Sexta-feira' },
  { value: 'sabado', label: 'Sábado' },
];
const WEEKDAY_INDEX_TO_VALUE = WEEKDAY_OPTIONS.map((option) => option.value);

function formatDateISO(date) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseISODateString(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map((part) => parseInt(part, 10));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(timeString) {
  if (!timeString) return '';
  try {
    const [hour, minute] = timeString.split(':');
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  } catch (error) {
    return timeString;
  }
}

class ScheduleAlertManager {
  constructor() {
    this.appId =
      typeof window !== 'undefined' && typeof window.__app_id !== 'undefined'
        ? window.__app_id
        : 'equipes';

    this.firebaseApp = null;
    this.db = null;
    this.auth = null;
    this.onAuthStateChanged = null;

    this.currentUser = null;
    this.currentEmail = '';

    this.trackedOwners = new Set();
    this.schedulesByOwner = new Map();
    this.scheduleUnsubs = new Map();
    this.ownerInfo = new Map();

    this.bannerEl = null;
    this.wrapperEl = null;
    this.intervalId = null;
    this.lastRenderedAlertSignature = '';

    this.originalTitle = '';
    this.originalTitleCaptured = false;
    this.originalFaviconHref = '';
    this.alertFaviconDataUrl = '';
    this.badgeState = { active: false, count: 0 };

    this.collection = null;
    this.collectionGroup = null;
    this.query = null;
    this.where = null;
    this.orderBy = null;
    this.onSnapshot = null;
    this.getDocs = null;

    this.authUnsub = null;
    this.membershipRefreshPromise = null;
    this.initPromise = null;

    if (typeof document !== 'undefined') {
      document.addEventListener('navbarLoaded', () => {
        this.handleNavbarLoaded();
      });
    }
  }

  async initialize() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.setup().catch((error) => {
      console.error('Erro ao iniciar monitor de alertas do cronograma:', error);
      this.initPromise = null;
      throw error;
    });

    return this.initPromise;
  }

  async setup() {
    const [appModule, authModule, firestoreModule, configModule] =
      await Promise.all([
        import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
        import(
          'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'
        ),
        import('./firebase-config.js'),
      ]);

    const firebaseConfig =
      configModule?.firebaseConfig ||
      (typeof window !== 'undefined' ? window.firebaseConfig : null);

    if (!firebaseConfig || !firebaseConfig.projectId) {
      throw new Error(
        'Configuração do Firebase indisponível para alertas do cronograma.',
      );
    }

    const { initializeApp, getApps, getApp } = appModule;
    const { getAuth, onAuthStateChanged } = authModule;
    const {
      getFirestore,
      collection,
      collectionGroup,
      query,
      where,
      orderBy,
      onSnapshot,
      getDocs,
    } = firestoreModule;

    this.firebaseApp = getApps().length
      ? getApp()
      : initializeApp(firebaseConfig);
    this.db = getFirestore(this.firebaseApp);
    this.collection = collection;
    this.collectionGroup = collectionGroup;
    this.query = query;
    this.where = where;
    this.orderBy = orderBy;
    this.onSnapshot = onSnapshot;
    this.getDocs = getDocs;

    this.auth = getAuth(this.firebaseApp);
    this.onAuthStateChanged = onAuthStateChanged;

    if (this.authUnsub) {
      this.authUnsub();
      this.authUnsub = null;
    }

    this.authUnsub = this.onAuthStateChanged(this.auth, (user) => {
      this.handleAuth(user);
    });

    if (this.auth.currentUser) {
      this.handleAuth(this.auth.currentUser);
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.updateBanner();
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        this.refreshMemberships();
        this.updateBanner();
      });
    }

    this.handleNavbarLoaded();
  }

  handleNavbarLoaded() {
    this.resolveBannerElements();
    this.updateBanner();
    this.ensureInterval();
  }

  resolveBannerElements() {
    if (typeof document === 'undefined') return;
    this.bannerEl = document.getElementById('scheduleAlertBanner');
    this.wrapperEl = document.getElementById('navbarAlertWrapper');
  }

  ensureInterval() {
    if (this.intervalId !== null) return;
    if (!this.bannerEl) return;
    this.intervalId = window.setInterval(
      () => this.updateBanner(),
      SCHEDULE_ALERT_INTERVAL_MS,
    );
  }

  handleAuth(user) {
    this.currentUser = user || null;
    this.currentEmail = (user?.email || '').toLowerCase();
    this.ownerInfo.clear();

    if (!this.currentUser) {
      this.applyOwnerSet(new Set());
      this.hideBanner();
      return;
    }

    this.ensureOwnerMeta(this.currentUser.uid, {
      email: this.currentUser.email || undefined,
      label: 'Minha equipe',
    });

    const owners = new Set([this.currentUser.uid]);
    this.applyOwnerSet(owners);
    this.refreshMemberships();
    this.updateBanner();
  }

  async refreshMemberships() {
    if (
      !this.db ||
      !this.collectionGroup ||
      !this.currentUser ||
      !this.currentEmail
    ) {
      return;
    }

    if (this.membershipRefreshPromise) {
      return this.membershipRefreshPromise;
    }

    this.membershipRefreshPromise = (async () => {
      try {
        const membersQuery = this.query(
          this.collectionGroup(this.db, 'members'),
          this.where('emailLower', '==', this.currentEmail),
        );
        const snapshot = await this.getDocs(membersQuery);
        const owners = new Set([this.currentUser.uid]);

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const ownerUid =
            data.ownerUid || this.extractOwnerUidFromPath(docSnap.ref.path);
          if (!ownerUid) return;
          owners.add(ownerUid);
          this.ensureOwnerMeta(ownerUid, {
            email: data.ownerEmail || undefined,
            label: data.ownerName ? `Equipe de ${data.ownerName}` : undefined,
          });
        });

        this.applyOwnerSet(owners);
      } catch (error) {
        console.error(
          'Erro ao buscar equipes compartilhadas para alertas do cronograma:',
          error,
        );
      } finally {
        this.membershipRefreshPromise = null;
      }
    })();

    return this.membershipRefreshPromise;
  }

  subscribeToOwnerSchedules(ownerUid) {
    if (!this.db || !this.collection || !this.onSnapshot) return;
    if (this.scheduleUnsubs.has(ownerUid)) return;

    try {
      const scheduleRef = this.collection(
        this.db,
        'artifacts',
        this.appId,
        'users',
        ownerUid,
        'dailySchedules',
      );
      const scheduleQuery = this.query(
        scheduleRef,
        this.orderBy('scheduledDate', 'desc'),
        this.orderBy('startTime', 'asc'),
      );
      const unsubscribe = this.onSnapshot(
        scheduleQuery,
        (snapshot) => {
          const entries = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            if (data.ownerUid && data.ownerEmail) {
              this.ensureOwnerMeta(data.ownerUid, { email: data.ownerEmail });
            }
            return {
              id: docSnap.id,
              title: data.title || '',
              scheduledDate: data.scheduledDate || '',
              startTime: data.startTime || '',
              endTime: data.endTime || '',
              notes: data.notes || '',
              responsibleEmail: data.responsibleEmail || '',
              status: data.status || 'nao_feito',
              videoUrl: data.videoUrl || '',
              repeatWeekly: !!data.repeatWeekly,
              repeatDays: Array.isArray(data.repeatDays)
                ? data.repeatDays.map((value) => value.toString())
                : [],
              alertEnabled: !!data.alertEnabled,
              alertMessage:
                typeof data.alertMessage === 'string' ? data.alertMessage : '',
            };
          });
          this.schedulesByOwner.set(ownerUid, entries);
          this.updateBanner();
        },
        (error) => {
          console.error(
            'Erro ao acompanhar cronograma diário para alertas do navbar:',
            error,
          );
        },
      );

      this.scheduleUnsubs.set(ownerUid, unsubscribe);
    } catch (error) {
      console.error(
        'Erro ao iniciar acompanhamento do cronograma para alertas do navbar:',
        error,
      );
    }
  }

  unsubscribeFromOwner(ownerUid) {
    const unsubscribe = this.scheduleUnsubs.get(ownerUid);
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
    this.scheduleUnsubs.delete(ownerUid);
    this.schedulesByOwner.delete(ownerUid);
  }

  applyOwnerSet(ownerSet) {
    const desiredOwners =
      ownerSet instanceof Set ? ownerSet : new Set(ownerSet);

    desiredOwners.forEach((ownerUid) => {
      if (!this.trackedOwners.has(ownerUid)) {
        this.subscribeToOwnerSchedules(ownerUid);
      }
    });

    this.trackedOwners.forEach((ownerUid) => {
      if (!desiredOwners.has(ownerUid)) {
        this.unsubscribeFromOwner(ownerUid);
      }
    });

    this.trackedOwners = desiredOwners;
    this.updateBanner();
  }

  ensureOwnerMeta(ownerUid, meta = {}) {
    const currentMeta = this.ownerInfo.get(ownerUid) || {};
    this.ownerInfo.set(ownerUid, { ...currentMeta, ...meta });
  }

  extractOwnerUidFromPath(path) {
    if (!path || typeof path !== 'string') return null;
    const segments = path.split('/');
    const index = segments.indexOf('users');
    if (index >= 0 && segments.length > index + 1) {
      return segments[index + 1];
    }
    return null;
  }

  isScheduleEntryActiveOnDate(entry, targetDateIso, targetDateObj) {
    if (!entry || !targetDateIso || !targetDateObj) {
      return false;
    }

    if (entry.scheduledDate === targetDateIso) {
      return true;
    }

    if (!entry.repeatWeekly || !entry.repeatDays?.length) {
      return false;
    }

    const entryDate = parseISODateString(entry.scheduledDate);
    if (entryDate && entryDate > targetDateObj) {
      return false;
    }

    const weekdayKey = WEEKDAY_INDEX_TO_VALUE[targetDateObj.getDay()];
    if (!weekdayKey) {
      return false;
    }

    return entry.repeatDays.includes(weekdayKey);
  }

  computeAlertTiming(entry, now) {
    if (!entry.startTime) return null;
    const [hour, minute] = entry.startTime
      .split(':')
      .map((value) => parseInt(value, 10));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }

    const alertStart = new Date(now);
    alertStart.setHours(hour, minute, 0, 0);
    const diffMinutes = (now.getTime() - alertStart.getTime()) / 60000;
    if (diffMinutes < 0 || diffMinutes > SCHEDULE_ALERT_WINDOW_MINUTES) {
      return null;
    }

    return { alertStart, diffMinutes };
  }

  collectActiveScheduleAlerts(now) {
    const normalizedEmail = (this.currentEmail || '').toLowerCase();
    if (!normalizedEmail) return [];

    const currentDateIso = formatDateISO(now);
    const currentDateObj =
      parseISODateString(currentDateIso) ||
      new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const alerts = [];

    this.trackedOwners.forEach((ownerUid) => {
      const entries = this.schedulesByOwner.get(ownerUid) || [];
      entries.forEach((entry) => {
        if (!entry.alertEnabled) return;
        if ((entry.status || 'nao_feito') === 'feito') return;
        const responsible = (entry.responsibleEmail || '').toLowerCase();
        if (!responsible || responsible !== normalizedEmail) return;
        if (
          !this.isScheduleEntryActiveOnDate(
            entry,
            currentDateIso,
            currentDateObj,
          )
        )
          return;
        const timing = this.computeAlertTiming(entry, now);
        if (!timing) return;
        alerts.push({ ownerUid, entry, ...timing });
      });
    });

    alerts.sort((a, b) => a.alertStart.getTime() - b.alertStart.getTime());
    return alerts;
  }

  resolveOwnerLabel(ownerUid) {
    if (!ownerUid) return 'Equipe compartilhada';
    if (this.currentUser && ownerUid === this.currentUser.uid) {
      return 'Minha equipe';
    }
    const meta = this.ownerInfo.get(ownerUid) || {};
    if (meta.label) return meta.label;
    if (meta.email) return `Equipe de ${meta.email}`;
    return 'Equipe compartilhada';
  }

  hideBanner() {
    if (this.wrapperEl) {
      this.wrapperEl.classList.add('hidden');
    }
    if (this.bannerEl) {
      this.bannerEl.classList.add('hidden');
      this.bannerEl.innerHTML = '';
      this.bannerEl.removeAttribute('data-alert-id');
    }
    this.lastRenderedAlertSignature = '';
    this.updateVisualIndicators(false, 0);
  }

  captureOriginalTitle() {
    if (this.originalTitleCaptured || typeof document === 'undefined') {
      return;
    }
    this.originalTitle = document.title || '';
    this.originalTitleCaptured = true;
  }

  ensureFaviconLink() {
    if (typeof document === 'undefined') return null;
    let link = document.querySelector('link[rel*="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.href = this.originalFaviconHref || 'favicon.ico';
      document.head.appendChild(link);
    }
    if (!this.originalFaviconHref) {
      this.originalFaviconHref = link.getAttribute('href') || link.href || '';
    }
    return link;
  }

  generateAlertFaviconDataUrl() {
    if (this.alertFaviconDataUrl) {
      return this.alertFaviconDataUrl;
    }

    if (typeof document === 'undefined') {
      return '';
    }

    try {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return '';
      }

      // Base background using brand color
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(0, 0, size, size);

      // Subtle gradient overlay for depth
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      // Draw circular badge in the top-right corner
      const badgeRadius = 20;
      const badgeCenterX = size - badgeRadius + 2;
      const badgeCenterY = badgeRadius - 4;
      ctx.beginPath();
      ctx.arc(badgeCenterX, badgeCenterY, badgeRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      // Exclamation mark
      ctx.fillStyle = '#ffffff';
      const markWidth = 6;
      const markHeight = 20;
      ctx.fillRect(
        badgeCenterX - markWidth / 2,
        badgeCenterY - markHeight / 2,
        markWidth,
        markHeight,
      );
      ctx.beginPath();
      ctx.arc(
        badgeCenterX,
        badgeCenterY + badgeRadius / 2.4,
        markWidth / 1.4,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      this.alertFaviconDataUrl = canvas.toDataURL('image/png');
      return this.alertFaviconDataUrl;
    } catch (error) {
      console.error('Erro ao gerar favicon de alerta:', error);
      return '';
    }
  }

  updateDocumentTitle(hasAlerts, alertCount) {
    if (typeof document === 'undefined') return;
    this.captureOriginalTitle();

    const baseTitle = this.originalTitle || document.title || 'VendedorPro';
    if (hasAlerts) {
      const normalizedCount = Math.min(Math.max(alertCount || 1, 1), 99);
      const countLabel = normalizedCount > 1 ? `(${normalizedCount}) ` : '';
      const alertTitle = `! ${countLabel}${baseTitle}`;
      if (document.title !== alertTitle) {
        document.title = alertTitle;
      }
    } else if (this.originalTitleCaptured && document.title !== baseTitle) {
      document.title = baseTitle;
    }
  }

  updateFavicon(hasAlerts) {
    const link = this.ensureFaviconLink();
    if (!link) return;

    if (hasAlerts) {
      const dataUrl = this.generateAlertFaviconDataUrl();
      if (dataUrl && link.href !== dataUrl) {
        link.href = dataUrl;
      }
    } else if (
      this.originalFaviconHref &&
      link.getAttribute('href') !== this.originalFaviconHref
    ) {
      link.href = this.originalFaviconHref;
    }
  }

  updateAppBadge(hasAlerts, alertCount) {
    if (typeof navigator === 'undefined') return;

    const normalizedCount = Math.min(Math.max(alertCount || 1, 1), 99);

    if (hasAlerts) {
      if (typeof navigator.setAppBadge === 'function') {
        Promise.resolve(navigator.setAppBadge(normalizedCount)).catch(() => {});
      } else if (typeof navigator.setExperimentalAppBadge === 'function') {
        try {
          navigator.setExperimentalAppBadge('!');
        } catch (error) {
          console.debug('Experimental badge API indisponível:', error);
        }
      } else if (typeof navigator.setClientBadge === 'function') {
        try {
          navigator.setClientBadge();
        } catch (error) {
          console.debug('Client badge API indisponível:', error);
        }
      }
    } else {
      if (typeof navigator.clearAppBadge === 'function') {
        Promise.resolve(navigator.clearAppBadge()).catch(() => {});
      } else if (typeof navigator.clearExperimentalAppBadge === 'function') {
        try {
          navigator.clearExperimentalAppBadge();
        } catch (error) {
          console.debug('Experimental badge API indisponível:', error);
        }
      } else if (typeof navigator.clearClientBadge === 'function') {
        try {
          navigator.clearClientBadge();
        } catch (error) {
          console.debug('Client badge API indisponível:', error);
        }
      }
    }
  }

  updateVisualIndicators(hasAlerts, alertCount) {
    const isSameState =
      this.badgeState.active === !!hasAlerts &&
      (!hasAlerts || this.badgeState.count === alertCount);
    if (isSameState) {
      return;
    }

    this.badgeState = {
      active: !!hasAlerts,
      count: hasAlerts ? alertCount : 0,
    };

    this.updateDocumentTitle(hasAlerts, alertCount);
    this.updateFavicon(hasAlerts);
    this.updateAppBadge(hasAlerts, alertCount);
  }

  updateBanner() {
    if (!this.bannerEl || !this.wrapperEl) {
      this.resolveBannerElements();
    }

    if (!this.bannerEl || !this.wrapperEl) {
      return;
    }

    const now = new Date();
    const alerts = this.collectActiveScheduleAlerts(now);
    if (!alerts.length) {
      this.hideBanner();
      return;
    }

    const { ownerUid, entry, alertStart } = alerts[0];
    const signature = [
      ownerUid,
      entry.id,
      alertStart.getTime(),
      entry.alertMessage || '',
      entry.title || '',
      alerts.length,
    ].join('||');

    if (signature !== this.lastRenderedAlertSignature) {
      const timeLabel = formatTime(entry.startTime);
      const titleLabel = entry.title || 'Etapa do cronograma';
      const ownerLabel = this.resolveOwnerLabel(ownerUid);
      const message = (entry.alertMessage || '').toString().trim();

      this.bannerEl.innerHTML = '';

      const titleEl = document.createElement('span');
      titleEl.className = 'alert-title';
      titleEl.textContent = 'ALERTA DE CRONOGRAMA';
      this.bannerEl.appendChild(titleEl);

      const detailsEl = document.createElement('span');
      detailsEl.className = 'alert-details';
      const detailsParts = [];
      if (timeLabel) detailsParts.push(timeLabel);
      detailsParts.push(titleLabel);
      detailsEl.textContent = detailsParts.join(' • ');
      this.bannerEl.appendChild(detailsEl);

      const extraParts = [ownerLabel];
      if (message) {
        extraParts.push(message);
      }
      if (extraParts.length) {
        const extraEl = document.createElement('span');
        extraEl.className = 'alert-extra';
        extraEl.textContent = extraParts.join(' — ');
        this.bannerEl.appendChild(extraEl);
      }

      const additionalAlerts = alerts.length - 1;
      if (additionalAlerts > 0) {
        const queueEl = document.createElement('span');
        queueEl.className = 'alert-extra';
        queueEl.textContent =
          additionalAlerts === 1
            ? 'Mais 1 alerta ativo'
            : `Mais ${additionalAlerts} alertas ativos`;
        this.bannerEl.appendChild(queueEl);
      }

      this.lastRenderedAlertSignature = signature;
    }

    this.wrapperEl.classList.remove('hidden');
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.setAttribute(
      'data-alert-id',
      this.lastRenderedAlertSignature,
    );
    this.updateVisualIndicators(true, alerts.length);
  }
}

const manager = new ScheduleAlertManager();

export function initializeScheduleAlertService() {
  return manager.initialize();
}

export function refreshScheduleAlertBanner() {
  manager.updateBanner();
}

export function refreshScheduleAlertMemberships() {
  return manager.refreshMemberships();
}

if (typeof window !== 'undefined') {
  window.scheduleAlertService = {
    initialize: () => manager.initialize(),
    refreshScheduleAlertBanner: () => manager.updateBanner(),
    refreshScheduleAlertMemberships: () => manager.refreshMemberships(),
  };
}
