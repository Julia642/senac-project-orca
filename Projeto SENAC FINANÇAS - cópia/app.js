const STORAGE_KEY_PREFIX = "controle_financeiro_state_user_v1";
const LEGACY_STORAGE_KEY = "controle_financeiro_state_v1";
const ACQUISITIONS_KEY_PREFIX = "orca_acquisitions_state_user_v1";
const THEME_KEY = "orca_theme";
const USERS_KEY = "orca_users_v1";
const SESSION_KEY = "orca_session_v1";

const appPage = document.getElementById("appPage");
const authGate = document.getElementById("authGate");
const introSplash = document.getElementById("introSplash");

const showLoginBtn = document.getElementById("showLogin");
const showRegisterBtn = document.getElementById("showRegister");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginFeedback = document.getElementById("loginFeedback");
const registerMismatch = document.getElementById("registerMismatch");
const registerFeedback = document.getElementById("registerFeedback");

const registerFullName = document.getElementById("registerFullName");
const registerProfilePhotoInput = document.getElementById("registerProfilePhotoInput");
const registerProfilePhotoPreview = document.getElementById("registerProfilePhotoPreview");
const registerProfilePhotoLabel = registerProfilePhotoPreview.closest(".register-photo-label");

const headerProfileImage = document.getElementById("headerProfileImage");
const headerProfileName = document.getElementById("headerProfileName");

const menuToggle = document.getElementById("menuToggle");
const menuDropdown = document.getElementById("menuDropdown");

const navButtons = document.querySelectorAll("[data-view-target]");
const views = {
  aquisicoes: document.getElementById("aquisicoesView"),
  financeiro: document.getElementById("financeiroView"),
  "visao-geral": document.getElementById("overviewView"),
};

const piggyBankTotal = document.getElementById("piggyBankTotal");
const piggyBankInput = document.getElementById("piggyBankInput");
const addPiggyBankValue = document.getElementById("addPiggyBankValue");
const removePiggyBankValue = document.getElementById("removePiggyBankValue");
const wishesList = document.getElementById("wishesList");
const addWishButton = document.getElementById("addWishButton");
const wishesFeedback = document.getElementById("wishesFeedback");

const overviewWelcome = document.getElementById("overviewWelcome");
const overviewPiggy = document.getElementById("overviewPiggy");
const overviewProgress = document.getElementById("overviewProgress");
const overviewFinance = document.getElementById("overviewFinance");

const periodsContainer = document.getElementById("periods");
const addPeriodButton = document.getElementById("addPeriod");

const accountDataModal = document.getElementById("accountDataModal");
const closeAccountData = document.getElementById("closeAccountData");
const cancelAccountData = document.getElementById("cancelAccountData");
const accountDataForm = document.getElementById("accountDataForm");
const accountEmail = document.getElementById("accountEmail");
const accountPassword = document.getElementById("accountPassword");
const accountPasswordConfirm = document.getElementById("accountPasswordConfirm");
const accountDataFeedback = document.getElementById("accountDataFeedback");

const editProfileModal = document.getElementById("editProfileModal");
const closeEditProfile = document.getElementById("closeEditProfile");
const cancelEditProfile = document.getElementById("cancelEditProfile");
const editProfileForm = document.getElementById("editProfileForm");
const editProfileName = document.getElementById("editProfileName");
const editProfilePhotoInput = document.getElementById("editProfilePhotoInput");
const editProfilePhotoPreview = document.getElementById("editProfilePhotoPreview");
const editProfilePhotoLabel = editProfilePhotoPreview.closest(".register-photo-label");
const editProfileFeedback = document.getElementById("editProfileFeedback");

const openForgotPasswordBtn = document.getElementById("openForgotPassword");
const forgotPasswordModal = document.getElementById("forgotPasswordModal");
const closeForgotPasswordBtn = document.getElementById("closeForgotPassword");
const cancelForgotPasswordBtn = document.getElementById("cancelForgotPassword");
const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const forgotPasswordEmail = document.getElementById("forgotPasswordEmail");
const forgotPasswordFeedback = document.getElementById("forgotPasswordFeedback");

const resetPasswordModal = document.getElementById("resetPasswordModal");
const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetPasswordInput = document.getElementById("resetPassword");
const resetPasswordConfirmInput = document.getElementById("resetPasswordConfirm");
const resetPasswordFeedback = document.getElementById("resetPasswordFeedback");

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

let currentUser = null;
let financeStorageKey = "";
let acquisitionsStorageKey = "";
let financeState = { periods: [] };
let acquisitionsState = { piggyBank: 0, wishes: [] };
let pendingResetToken = "";
let pendingResetEmail = "";
let registerPhotoData = "";
let editPhotoData = null;

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function getFinanceStorageKey(email) {
  return `${STORAGE_KEY_PREFIX}_${normalizeEmail(email)}`;
}

function getAcquisitionsStorageKey(email) {
  return `${ACQUISITIONS_KEY_PREFIX}_${normalizeEmail(email)}`;
}

function safeParseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function loadUsers() {
  const parsed = safeParseJson(localStorage.getItem(USERS_KEY), {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadSession() {
  const parsed = safeParseJson(localStorage.getItem(SESSION_KEY), null);
  if (!parsed || typeof parsed.email !== "string") return null;
  return { email: normalizeEmail(parsed.email) };
}

function saveSession(email) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email: normalizeEmail(email) }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function toMoney(value) {
  return brl.format(Number(value) || 0);
}

function toPositiveNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return number;
}

function formatTodayTitle() {
  return "Contas a pagar até dia dd/mm";
}

function createEmptyPeriod() {
  return {
    id: generateId(),
    title: formatTodayTitle(),
    expenses: [],
    incomes: [],
  };
}

function createEmptyWish() {
  return {
    id: generateId(),
    title: "Novo período de aquisição",
    itemName: "Novo item",
    description: "",
    price: 0,
    fromPiggy: 0,
    outsideSaved: 0,
    photo: "",
  };
}

function parseSavedFinance(raw) {
  const parsed = safeParseJson(raw, null);
  if (!parsed || !Array.isArray(parsed.periods)) return null;
  return parsed;
}

function loadFinanceState() {
  if (!financeStorageKey) return { periods: [createEmptyPeriod()] };

  const currentParsed = parseSavedFinance(localStorage.getItem(financeStorageKey));
  if (currentParsed) return currentParsed;

  const legacyParsed = parseSavedFinance(localStorage.getItem(LEGACY_STORAGE_KEY));
  if (legacyParsed) {
    localStorage.setItem(financeStorageKey, JSON.stringify(legacyParsed));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return legacyParsed;
  }

  return { periods: [createEmptyPeriod()] };
}

function saveFinanceState() {
  if (!financeStorageKey) return;
  localStorage.setItem(financeStorageKey, JSON.stringify(financeState));
}

function loadAcquisitionsState() {
  if (!acquisitionsStorageKey) return { piggyBank: 0, wishes: [] };

  const parsed = safeParseJson(localStorage.getItem(acquisitionsStorageKey), null);
  if (!parsed || typeof parsed !== "object") {
    return { piggyBank: 0, wishes: [] };
  }

  const wishes = Array.isArray(parsed.wishes) ? parsed.wishes : [];
  return {
    piggyBank: toPositiveNumber(parsed.piggyBank),
    wishes: wishes.map((wish) => ({
      id: String(wish.id || generateId()),
      title: String(wish.title || "Novo período de aquisição"),
      itemName: String(wish.itemName || "Novo item"),
      description: String(wish.description || ""),
      price: toPositiveNumber(wish.price),
      fromPiggy: toPositiveNumber(wish.fromPiggy),
      outsideSaved: toPositiveNumber(wish.outsideSaved),
      photo: typeof wish.photo === "string" ? wish.photo : "",
    })),
  };
}

function saveAcquisitionsState() {
  if (!acquisitionsStorageKey) return;
  localStorage.setItem(acquisitionsStorageKey, JSON.stringify(acquisitionsState));
}

function sumFinanceItems(items) {
  return items.reduce((acc, item) => acc + (Number(item.value) || 0), 0);
}

function parseCurrency(text) {
  if (!text) return 0;
  const normalized = text
    .replace(/R\$|\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const value = parseFloat(normalized);
  return Number.isNaN(value) ? 0 : value;
}

function findFinanceItem(itemId) {
  for (const period of financeState.periods) {
    const expense = period.expenses.find((item) => item.id === itemId);
    if (expense) return expense;

    const income = period.incomes.find((item) => item.id === itemId);
    if (income) return income;
  }
  return null;
}

function renderFinanceItemRow(item, periodId, kind) {
  const color = kind === "expense" ? "red" : "green";
  const label = item.name && item.name.trim() ? item.name : "Novo item";

  return `
    <div class="item-row" data-item-id="${item.id}" data-period-id="${periodId}" data-kind="${kind}">
      <div class="item-name editable" contenteditable="true" data-edit-name="${item.id}">${label}</div>
      <div class="item-value editable" contenteditable="true" data-edit-value="${item.id}" style="color: var(--${color});">${toMoney(item.value)}</div>
      <div class="item-actions">
        <button class="action-btn" data-remove-item="${item.id}">✖</button>
      </div>
    </div>
  `;
}

function bindFinanceActions() {
  document.querySelectorAll("[data-add-item]").forEach((btn) => {
    btn.onclick = () => {
      const period = financeState.periods.find((p) => p.id === btn.dataset.addItem);
      if (!period) return;

      const item = { id: generateId(), name: "Novo item", value: 0 };
      if (btn.dataset.kind === "expense") {
        period.expenses.push(item);
      } else {
        period.incomes.push(item);
      }
      renderFinance();
    };
  });

  document.querySelectorAll("[data-remove-item]").forEach((btn) => {
    btn.onclick = () => {
      financeState.periods.forEach((period) => {
        period.expenses = period.expenses.filter((item) => item.id !== btn.dataset.removeItem);
        period.incomes = period.incomes.filter((item) => item.id !== btn.dataset.removeItem);
      });
      renderFinance();
    };
  });

  document.querySelectorAll("[data-remove-period]").forEach((btn) => {
    btn.onclick = () => {
      financeState.periods = financeState.periods.filter((period) => period.id !== btn.dataset.removePeriod);
      if (financeState.periods.length === 0) {
        financeState.periods = [createEmptyPeriod()];
      }
      renderFinance();
    };
  });

  document.querySelectorAll("[data-period-title]").forEach((el) => {
    el.onblur = () => {
      const period = financeState.periods.find((p) => p.id === el.dataset.periodTitle);
      if (!period) return;
      period.title = el.textContent.trim() || formatTodayTitle();
      saveFinanceState();
      updateOverview();
    };
  });

  document.querySelectorAll("[data-edit-name]").forEach((el) => {
    el.onblur = () => {
      const item = findFinanceItem(el.dataset.editName);
      if (!item) return;
      item.name = el.textContent.trim() || "Novo item";
      renderFinance();
    };
  });

  document.querySelectorAll("[data-edit-value]").forEach((el) => {
    el.onblur = () => {
      const item = findFinanceItem(el.dataset.editValue);
      if (!item) return;
      item.value = parseCurrency(el.textContent);
      renderFinance();
    };
  });
}

function renderFinance() {
  periodsContainer.innerHTML = "";

  let totalIncomeAll = 0;
  let totalExpenseAll = 0;

  financeState.periods.forEach((period) => {
    const totalExpense = sumFinanceItems(period.expenses);
    const totalIncome = sumFinanceItems(period.incomes);
    const saldo = totalIncome - totalExpense;

    totalIncomeAll += totalIncome;
    totalExpenseAll += totalExpense;

    const card = document.createElement("div");
    card.className = "period-card";
    card.innerHTML = `
      <div class="period-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="icon-chip chip-green icon-img-wrap">
            <img src="Icones/imagecalendario.png" alt="Calendário" class="icon-img" />
          </span>
          <span class="period-title" contenteditable="true" data-period-title="${period.id}">${period.title}</span>
        </div>
        <button class="trash-btn" data-remove-period="${period.id}">🗑️</button>
      </div>
      <div class="period-body">
        <div class="section">
          <div class="section-title">
            <span class="chip-red icon-chip icon-img-wrap" style="width:22px;height:22px;">
              <img src="Icones/imagedespesa.png" alt="Despesas" class="icon-img" />
            </span>
            Despesas
          </div>
          ${period.expenses.map((item) => renderFinanceItemRow(item, period.id, "expense")).join("")}
          <div class="add-link" data-add-item="${period.id}" data-kind="expense">＋ Adicionar</div>
          <div class="total-row red"><span>Total Gasto</span><span>${toMoney(totalExpense)}</span></div>
        </div>
        <div class="section">
          <div class="section-title">
            <span class="chip-green icon-chip icon-img-wrap" style="width:22px;height:22px;">
              <img src="Icones/imagerecebimento.png" alt="Recebimentos" class="icon-img" />
            </span>
            Recebimentos
          </div>
          ${period.incomes.map((item) => renderFinanceItemRow(item, period.id, "income")).join("")}
          <div class="add-link" data-add-item="${period.id}" data-kind="income">＋ Adicionar</div>
          <div class="total-row green"><span>Total Saldo</span><span>${toMoney(totalIncome)}</span></div>
        </div>
        <div class="saldo-final ${saldo < 0 ? "negative" : ""}">
          <span>Saldo Final</span>
          <span>${toMoney(saldo)}</span>
        </div>
      </div>
    `;

    periodsContainer.appendChild(card);
  });

  const sobra = totalIncomeAll - totalExpenseAll;
  document.getElementById("totalGanho").textContent = toMoney(totalIncomeAll);
  document.getElementById("totalGasto").textContent = toMoney(totalExpenseAll);

  const sobraEl = document.getElementById("sobra");
  sobraEl.textContent = toMoney(sobra);
  sobraEl.className = `summary-value ${sobra >= 0 ? "green" : "red"}`;

  bindFinanceActions();
  saveFinanceState();
  updateOverview();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getWishById(wishId) {
  return acquisitionsState.wishes.find((wish) => wish.id === wishId);
}

function renderWishes() {
  piggyBankTotal.textContent = toMoney(acquisitionsState.piggyBank);

  if (acquisitionsState.wishes.length === 0) {
    wishesList.innerHTML = "";
    updateOverview();
    saveAcquisitionsState();
    return;
  }

  wishesList.innerHTML = acquisitionsState.wishes
    .map((wish, index) => {
      const totalSaved = wish.fromPiggy + wish.outsideSaved;
      const progress = wish.price > 0 ? Math.min(100, (totalSaved / wish.price) * 100) : 0;
      const progressFill = progress > 0 ? progress.toFixed(2) : "0";
      const photoSrc = wish.photo || buildAvatarFallback(wish.itemName || "Item");

      return `
        <article class="wish-card" data-wish-id="${wish.id}">
          <div class="wish-card-head">
            <strong>Período ${index + 1}</strong>
            <button type="button" class="wish-delete-btn" data-wish-delete="${wish.id}" aria-label="Remover período">✕</button>
          </div>

          <div class="wish-card-body">
            <label class="auth-field">
              <span>Título do período</span>
              <input class="field-input" type="text" data-wish-field="title" data-wish-id="${wish.id}" value="${escapeHtml(wish.title)}" />
            </label>

            <div class="wish-photo-row">
              <img class="wish-photo-preview" src="${photoSrc}" alt="Foto do item" />
              <label class="wish-photo-label">
                <span>Foto do item</span>
                <input class="wish-file-input" type="file" accept="image/*" data-wish-photo="${wish.id}" />
              </label>
            </div>

            <label class="auth-field">
              <span>Item</span>
              <input class="field-input" type="text" data-wish-field="itemName" data-wish-id="${wish.id}" value="${escapeHtml(wish.itemName)}" />
            </label>

            <label class="auth-field">
              <span>Descrição</span>
              <textarea class="wish-textarea" data-wish-field="description" data-wish-id="${wish.id}">${escapeHtml(wish.description)}</textarea>
            </label>

            <div class="wish-number-grid">
              <label class="auth-field">
                <span>Valor do item (R$)</span>
                <input class="field-input" type="number" min="0" step="0.01" data-wish-field="price" data-wish-id="${wish.id}" value="${wish.price}" />
              </label>
            </div>

            <div class="wish-progress-wrap">
              <div class="wish-progress-head">
                <span>Progresso da meta</span>
                <strong>${progress.toFixed(1)}%</strong>
              </div>
              <div class="wish-progress-bar">
                <div class="wish-progress-fill" style="width:${progressFill}%"></div>
              </div>
              <span class="wish-progress-text">${progress.toFixed(1)}% da meta atingida</span>
            </div>

            <div class="wish-values">
              <span>Valor do item: ${toMoney(wish.price)}</span>
              <span>Total guardado para o item: ${toMoney(totalSaved)}</span>
              <span>Separado do cofrinho: ${toMoney(wish.fromPiggy)}</span>
              <span>Guardado sem retirar do cofrinho: ${toMoney(wish.outsideSaved)}</span>
            </div>

            <div class="wish-amount-grid">
              <label class="auth-field">
                <span>Valor guardado para este item</span>
                <input class="field-input" type="number" min="0" step="0.01" placeholder="0,00" data-wish-contribution-input="${wish.id}" />
              </label>
              <div class="wish-amount-actions">
                <button type="button" class="auth-submit" data-wish-contribution-add="${wish.id}">Adicionar</button>
                <button type="button" class="ghost-action" data-wish-contribution-remove="${wish.id}">Remover</button>
              </div>
            </div>

            <label class="wish-checkbox-row">
              <input type="checkbox" data-wish-use-piggy="${wish.id}" checked />
              <span>Descontar do cofrinho geral</span>
            </label>
          </div>
        </article>
      `;
    })
    .join("");

  bindWishActions();
  saveAcquisitionsState();
  updateOverview();
}

function bindWishActions() {
  document.querySelectorAll("[data-wish-field]").forEach((field) => {
    const wishId = field.dataset.wishId;
    const key = field.dataset.wishField;

    field.addEventListener("change", () => {
      const wish = getWishById(wishId);
      if (!wish) return;

      if (key === "price") {
        wish.price = toPositiveNumber(field.value);
      } else {
        wish[key] = field.value.trim();
      }

      renderWishes();
    });
  });

  document.querySelectorAll("[data-wish-photo]").forEach((input) => {
    input.addEventListener("change", async () => {
      const wishId = input.dataset.wishPhoto;
      const wish = getWishById(wishId);
      if (!wish || !input.files || !input.files[0]) return;

      try {
        wish.photo = await readFileAsDataUrl(input.files[0]);
        renderWishes();
      } catch {
        setFeedback(wishesFeedback, "Não foi possível carregar a foto do item.", "error");
      }
    });
  });

  document.querySelectorAll("[data-wish-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      acquisitionsState.wishes = acquisitionsState.wishes.filter((wish) => wish.id !== button.dataset.wishDelete);
      renderWishes();
      setFeedback(wishesFeedback, "", "");
    });
  });

  document.querySelectorAll("[data-wish-contribution-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const wishId = button.dataset.wishContributionAdd;
      const input = document.querySelector(`[data-wish-contribution-input='${wishId}']`);
      const usePiggy = document.querySelector(`[data-wish-use-piggy='${wishId}']`);
      const wish = getWishById(wishId);

      if (!input || !wish) return;

      const value = toPositiveNumber(input.value);
      if (!value) {
        setFeedback(wishesFeedback, "Informe um valor maior que zero para guardar no item.", "error");
        return;
      }

      const shouldUsePiggy = Boolean(usePiggy && usePiggy.checked);
      if (shouldUsePiggy) {
        if (acquisitionsState.piggyBank < value) {
          setFeedback(wishesFeedback, "O cofrinho geral não possui saldo suficiente para essa separação.", "error");
          return;
        }
        acquisitionsState.piggyBank -= value;
        wish.fromPiggy += value;
      } else {
        wish.outsideSaved += value;
      }

      input.value = "";
      setFeedback(wishesFeedback, "Valor guardado com sucesso.", "success");
      renderWishes();
    });
  });

  document.querySelectorAll("[data-wish-contribution-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const wishId = button.dataset.wishContributionRemove;
      const input = document.querySelector(`[data-wish-contribution-input='${wishId}']`);
      const usePiggy = document.querySelector(`[data-wish-use-piggy='${wishId}']`);
      const wish = getWishById(wishId);

      if (!input || !wish) return;

      const value = toPositiveNumber(input.value);
      if (!value) {
        setFeedback(wishesFeedback, "Informe um valor maior que zero para remover do item.", "error");
        return;
      }

      const shouldUsePiggy = Boolean(usePiggy && usePiggy.checked);
      if (shouldUsePiggy) {
        if (wish.fromPiggy < value) {
          setFeedback(wishesFeedback, "Esse item não possui esse valor separado do cofrinho para remover.", "error");
          return;
        }
        wish.fromPiggy -= value;
        acquisitionsState.piggyBank += value;
        setFeedback(wishesFeedback, "Valor removido do item e devolvido ao cofrinho.", "success");
      } else {
        if (wish.outsideSaved < value) {
          setFeedback(wishesFeedback, "Esse item não possui esse valor guardado nessa modalidade.", "error");
          return;
        }
        wish.outsideSaved -= value;
        setFeedback(wishesFeedback, "Valor removido do item com sucesso.", "success");
      }

      input.value = "";
      renderWishes();
    });
  });
}

function setFeedback(element, text, type = "") {
  if (!element) return;
  element.textContent = text;
  element.className = "auth-feedback";
  if (type) element.classList.add(type);
}

function clearAuthMessages() {
  setFeedback(loginFeedback, "", "error");
  setFeedback(registerMismatch, "", "error");
  setFeedback(registerFeedback, "", "success");
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.remove("is-hidden");
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.add("is-hidden");
}

function closeAllModals() {
  [
    accountDataModal,
    editProfileModal,
    forgotPasswordModal,
    resetPasswordModal,
  ].forEach((modal) => closeModal(modal));
}

function switchAuthMode(mode) {
  clearAuthMessages();
  const isLogin = mode === "login";

  loginForm.classList.toggle("is-hidden", !isLogin);
  registerForm.classList.toggle("is-hidden", isLogin);
  showLoginBtn.classList.toggle("active", isLogin);
  showRegisterBtn.classList.toggle("active", !isLogin);
  showLoginBtn.setAttribute("aria-selected", isLogin ? "true" : "false");
  showRegisterBtn.setAttribute("aria-selected", isLogin ? "false" : "true");
}

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
}

function toggleTheme() {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark ? "dark" : "light");
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
}

function moveStorageData(oldKey, newKey) {
  if (!oldKey || oldKey === newKey) return;
  const oldData = localStorage.getItem(oldKey);
  if (oldData === null) return;

  if (!localStorage.getItem(newKey)) {
    localStorage.setItem(newKey, oldData);
  }
  localStorage.removeItem(oldKey);
}

function extractInitials(name) {
  const clean = (name || "").trim();
  if (!clean) return "OR";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function buildAvatarFallback(name) {
  const initials = extractInitials(name);
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stop-color='#dff4e9'/>
          <stop offset='100%' stop-color='#d7e8ff'/>
        </linearGradient>
      </defs>
      <rect width='120' height='120' fill='url(#g)' />
      <text x='50%' y='56%' text-anchor='middle' font-size='42' font-family='Arial, sans-serif' fill='#245a48' font-weight='700'>${initials}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function applyAvatarPreview(label, image, photoData, fallbackName) {
  if (!label || !image) return;

  if (photoData) {
    label.classList.add("has-image");
    image.src = photoData;
    return;
  }

  label.classList.remove("has-image");
  image.src = buildAvatarFallback(fallbackName);
}

function updateProfileBadge() {
  if (!currentUser) return;

  const displayName = (currentUser.fullName || "Perfil sem nome").trim();
  headerProfileName.textContent = displayName;
  headerProfileImage.src = currentUser.profilePhoto || buildAvatarFallback(displayName || currentUser.email);

  overviewWelcome.textContent = `Olá, ${displayName}. Acompanhe seu progresso geral no Orça.`;
}

function setActiveView(viewKey) {
  Object.entries(views).forEach(([key, view]) => {
    view.classList.toggle("is-hidden", key !== viewKey);
  });

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.viewTarget === viewKey);
  });
}

function updateOverview() {
  const piggyValue = acquisitionsState.piggyBank;
  overviewPiggy.textContent = toMoney(piggyValue);

  const progressValues = acquisitionsState.wishes.map((wish) => {
    const totalSaved = wish.fromPiggy + wish.outsideSaved;
    if (wish.price <= 0) return 0;
    return Math.min(100, (totalSaved / wish.price) * 100);
  });

  const averageProgress = progressValues.length
    ? progressValues.reduce((acc, value) => acc + value, 0) / progressValues.length
    : 0;

  overviewProgress.textContent = `${averageProgress.toFixed(1)}%`;

  const totalIncome = financeState.periods.reduce((acc, period) => acc + sumFinanceItems(period.incomes), 0);
  const totalExpense = financeState.periods.reduce((acc, period) => acc + sumFinanceItems(period.expenses), 0);
  overviewFinance.textContent = toMoney(totalIncome - totalExpense);
}

function showAuth(mode = "login") {
  closeAllModals();
  menuDropdown.classList.add("is-hidden");
  menuToggle.setAttribute("aria-expanded", "false");
  appPage.classList.add("is-hidden");
  authGate.classList.remove("is-hidden");
  switchAuthMode(mode);
}

function showAppForUser(user) {
  currentUser = user;
  financeStorageKey = getFinanceStorageKey(currentUser.email);
  acquisitionsStorageKey = getAcquisitionsStorageKey(currentUser.email);

  financeState = loadFinanceState();
  if (!financeState.periods || financeState.periods.length === 0) {
    financeState.periods = [createEmptyPeriod()];
  }

  acquisitionsState = loadAcquisitionsState();

  authGate.classList.add("is-hidden");
  appPage.classList.remove("is-hidden");

  updateProfileBadge();
  renderFinance();
  renderWishes();
  setActiveView("financeiro");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function clearResetQueryParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("reset_token");
  url.searchParams.delete("email");
  window.history.replaceState({}, "", url.pathname + url.search);
}

function maybeOpenResetModalFromLink() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("reset_token");
  const email = params.get("email");

  if (!token || !email) return;

  pendingResetToken = token;
  pendingResetEmail = email;
  resetPasswordForm.reset();
  setFeedback(resetPasswordFeedback, "");
  openModal(resetPasswordModal);
}

async function requestPasswordResetEmail(email) {
  const response = await fetch("/api/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const payload = safeParseJson(await response.text(), {});
  if (!response.ok) {
    throw new Error(payload.message || "Não foi possível enviar o e-mail de recuperação.");
  }
  return payload;
}

async function validateResetToken(token, email) {
  const response = await fetch("/api/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, email }),
  });

  const payload = safeParseJson(await response.text(), {});
  if (!response.ok) {
    throw new Error(payload.message || "Não foi possível validar o link de recuperação.");
  }
  return payload;
}

async function sendAccountChangeConfirmation(oldEmail, newEmail) {
  const response = await fetch("/api/account-change-notification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_email: oldEmail, new_email: newEmail }),
  });

  const payload = safeParseJson(await response.text(), {});
  if (!response.ok) {
    throw new Error(payload.message || "Não foi possível enviar a confirmação por e-mail.");
  }
  return payload;
}

function bindPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.target);
      if (!input) return;

      const showPassword = input.type === "password";
      input.type = showPassword ? "text" : "password";
      button.setAttribute("data-visible", showPassword ? "true" : "false");
      button.setAttribute("aria-label", showPassword ? "Ocultar senha" : "Mostrar senha");
    });
  });
}

showLoginBtn.addEventListener("click", () => switchAuthMode("login"));
showRegisterBtn.addEventListener("click", () => switchAuthMode("register"));

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setFeedback(loginFeedback, "", "error");

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const key = normalizeEmail(email);

  const users = loadUsers();
  const user = users[key];

  if (!key || !password || !user || user.password !== password) {
    setFeedback(loginFeedback, "E-mail ou senha inválidos.", "error");
    return;
  }

  saveSession(key);
  showAppForUser(user);
  loginForm.reset();
});

registerProfilePhotoInput.addEventListener("change", async () => {
  if (!registerProfilePhotoInput.files || !registerProfilePhotoInput.files[0]) {
    registerPhotoData = "";
    applyAvatarPreview(registerProfilePhotoLabel, registerProfilePhotoPreview, "", registerFullName.value);
    return;
  }

  try {
    registerPhotoData = await readFileAsDataUrl(registerProfilePhotoInput.files[0]);
    applyAvatarPreview(registerProfilePhotoLabel, registerProfilePhotoPreview, registerPhotoData, registerFullName.value);
  } catch {
    registerPhotoData = "";
    setFeedback(registerFeedback, "Não foi possível carregar a foto de perfil.", "error");
  }
});

registerFullName.addEventListener("input", () => {
  if (!registerPhotoData) {
    applyAvatarPreview(registerProfilePhotoLabel, registerProfilePhotoPreview, "", registerFullName.value);
  }
});

registerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setFeedback(registerMismatch, "", "error");
  setFeedback(registerFeedback, "", "success");

  const fullName = registerFullName.value.trim();
  const emailRaw = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  const confirmPassword = document.getElementById("registerConfirm").value;
  const key = normalizeEmail(emailRaw);

  if (!fullName) {
    setFeedback(registerFeedback, "Informe seu nome e sobrenome.", "error");
    return;
  }

  if (password !== confirmPassword) {
    setFeedback(registerMismatch, "Ambas as senhas devem ser iguais. Elas estão diferentes.", "error");
    return;
  }

  if (!key || !password) {
    setFeedback(registerFeedback, "Preencha e-mail e senha para continuar.", "error");
    return;
  }

  const users = loadUsers();
  if (users[key]) {
    setFeedback(registerFeedback, "Esse e-mail já está cadastrado.", "error");
    return;
  }

  const newUser = {
    email: emailRaw,
    password,
    fullName,
    profilePhoto: registerPhotoData,
  };

  users[key] = newUser;
  saveUsers(users);
  saveSession(key);

  setFeedback(registerFeedback, "Cadastro realizado com sucesso.", "success");
  showAppForUser(newUser);

  registerForm.reset();
  registerPhotoData = "";
  applyAvatarPreview(registerProfilePhotoLabel, registerProfilePhotoPreview, "", "");
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveView(button.dataset.viewTarget);
    menuDropdown.classList.add("is-hidden");
    menuToggle.setAttribute("aria-expanded", "false");
  });
});

menuToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  const isHidden = menuDropdown.classList.contains("is-hidden");
  menuDropdown.classList.toggle("is-hidden", !isHidden);
  menuToggle.setAttribute("aria-expanded", isHidden ? "true" : "false");
});

menuDropdown.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-menu-action]");
  if (!button) return;

  const action = button.dataset.menuAction;
  menuDropdown.classList.add("is-hidden");
  menuToggle.setAttribute("aria-expanded", "false");

  if (action === "change-account") {
    if (!currentUser) return;
    accountEmail.value = currentUser.email;
    accountPassword.value = "";
    accountPasswordConfirm.value = "";
    setFeedback(accountDataFeedback, "");
    openModal(accountDataModal);
    return;
  }

  if (action === "toggle-theme") {
    toggleTheme();
    return;
  }

  if (action === "edit-profile") {
    if (!currentUser) return;
    editProfileName.value = currentUser.fullName || "";
    editPhotoData = null;
    applyAvatarPreview(editProfilePhotoLabel, editProfilePhotoPreview, currentUser.profilePhoto || "", currentUser.fullName || currentUser.email);
    setFeedback(editProfileFeedback, "");
    openModal(editProfileModal);
    return;
  }

  if (action === "logout") {
    clearSession();
    currentUser = null;
    financeStorageKey = "";
    acquisitionsStorageKey = "";
    financeState = { periods: [createEmptyPeriod()] };
    acquisitionsState = { piggyBank: 0, wishes: [] };
    showAuth("login");
  }
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".menu-wrapper")) return;
  menuDropdown.classList.add("is-hidden");
  menuToggle.setAttribute("aria-expanded", "false");
});

addPiggyBankValue.addEventListener("click", () => {
  const value = toPositiveNumber(piggyBankInput.value);
  if (!value) {
    setFeedback(wishesFeedback, "Informe um valor maior que zero para adicionar ao cofrinho.", "error");
    return;
  }

  acquisitionsState.piggyBank += value;
  piggyBankInput.value = "";
  setFeedback(wishesFeedback, "Valor adicionado ao cofrinho com sucesso.", "success");
  renderWishes();
});

removePiggyBankValue.addEventListener("click", () => {
  const value = toPositiveNumber(piggyBankInput.value);
  if (!value) {
    setFeedback(wishesFeedback, "Informe um valor maior que zero para remover do cofrinho.", "error");
    return;
  }

  if (acquisitionsState.piggyBank < value) {
    setFeedback(wishesFeedback, "O cofrinho geral não possui saldo suficiente para essa remoção.", "error");
    return;
  }

  acquisitionsState.piggyBank -= value;
  piggyBankInput.value = "";
  setFeedback(wishesFeedback, "Valor removido do cofrinho com sucesso.", "success");
  renderWishes();
});

addWishButton.addEventListener("click", () => {
  acquisitionsState.wishes.push(createEmptyWish());
  setFeedback(wishesFeedback, "", "");
  renderWishes();
});

addPeriodButton.addEventListener("click", () => {
  financeState.periods.push(createEmptyPeriod());
  renderFinance();
});

closeAccountData.addEventListener("click", () => closeModal(accountDataModal));
cancelAccountData.addEventListener("click", () => closeModal(accountDataModal));

accountDataModal.addEventListener("click", (event) => {
  if (event.target === accountDataModal) closeModal(accountDataModal);
});

accountDataForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFeedback(accountDataFeedback, "");

  if (!currentUser) {
    setFeedback(accountDataFeedback, "Faça login novamente para alterar sua conta.", "error");
    return;
  }

  const users = loadUsers();
  const oldKey = normalizeEmail(currentUser.email);
  const account = users[oldKey];
  if (!account) {
    setFeedback(accountDataFeedback, "Conta não encontrada. Faça login novamente.", "error");
    return;
  }

  const nextEmailRaw = accountEmail.value.trim();
  const nextPassword = accountPassword.value;
  const nextPasswordConfirm = accountPasswordConfirm.value;
  const nextKey = normalizeEmail(nextEmailRaw);

  if (!nextKey) {
    setFeedback(accountDataFeedback, "Informe um e-mail válido.", "error");
    return;
  }

  if (!nextPassword) {
    setFeedback(accountDataFeedback, "A senha não pode ficar vazia.", "error");
    return;
  }

  if (nextPassword !== nextPasswordConfirm) {
    setFeedback(accountDataFeedback, "Ambas as senhas devem ser iguais. Elas estão diferentes.", "error");
    return;
  }

  if (nextKey !== oldKey && users[nextKey]) {
    setFeedback(accountDataFeedback, "Já existe uma conta com esse e-mail.", "error");
    return;
  }

  const oldEmail = currentUser.email;
  const passwordChanged = nextPassword !== account.password;
  const oldFinanceKey = financeStorageKey;
  const oldAcquisitionKey = acquisitionsStorageKey;

  const updatedUser = {
    email: nextEmailRaw,
    password: nextPassword,
    fullName: currentUser.fullName || "",
    profilePhoto: currentUser.profilePhoto || "",
  };

  delete users[oldKey];
  users[nextKey] = updatedUser;
  saveUsers(users);

  saveSession(nextKey);
  financeStorageKey = getFinanceStorageKey(nextKey);
  acquisitionsStorageKey = getAcquisitionsStorageKey(nextKey);
  moveStorageData(oldFinanceKey, financeStorageKey);
  moveStorageData(oldAcquisitionKey, acquisitionsStorageKey);

  currentUser = updatedUser;
  updateProfileBadge();

  try {
    await sendAccountChangeConfirmation(oldEmail, nextEmailRaw);
    const successMessage = passwordChanged
      ? "Senha alterada com sucesso. E-mail de confirmação enviado."
      : "Dados de login atualizados com sucesso. E-mail de confirmação enviado.";
    setFeedback(accountDataFeedback, successMessage, "success");
  } catch (error) {
    setFeedback(
      accountDataFeedback,
      `Dados de login atualizados, mas não foi possível enviar o e-mail de confirmação: ${error.message}`,
      "error",
    );
  }

  window.setTimeout(() => closeModal(accountDataModal), 900);
});

closeEditProfile.addEventListener("click", () => closeModal(editProfileModal));
cancelEditProfile.addEventListener("click", () => closeModal(editProfileModal));

editProfileModal.addEventListener("click", (event) => {
  if (event.target === editProfileModal) closeModal(editProfileModal);
});

editProfilePhotoInput.addEventListener("change", async () => {
  if (!editProfilePhotoInput.files || !editProfilePhotoInput.files[0]) {
    editPhotoData = null;
    if (currentUser) {
      applyAvatarPreview(editProfilePhotoLabel, editProfilePhotoPreview, currentUser.profilePhoto || "", currentUser.fullName || currentUser.email);
    }
    return;
  }

  try {
    editPhotoData = await readFileAsDataUrl(editProfilePhotoInput.files[0]);
    applyAvatarPreview(editProfilePhotoLabel, editProfilePhotoPreview, editPhotoData, editProfileName.value.trim());
  } catch {
    editPhotoData = null;
    setFeedback(editProfileFeedback, "Não foi possível carregar a foto selecionada.", "error");
  }
});

editProfileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setFeedback(editProfileFeedback, "");

  if (!currentUser) {
    setFeedback(editProfileFeedback, "Faça login novamente para editar seu perfil.", "error");
    return;
  }

  const users = loadUsers();
  const key = normalizeEmail(currentUser.email);
  const user = users[key];
  if (!user) {
    setFeedback(editProfileFeedback, "Conta não encontrada. Faça login novamente.", "error");
    return;
  }

  const updatedName = editProfileName.value.trim();
  const hasNameChange = Boolean(updatedName);
  const hasPhotoChange = typeof editPhotoData === "string";

  if (!hasNameChange && !hasPhotoChange) {
    setFeedback(editProfileFeedback, "Atualize nome, foto ou ambos para salvar.", "error");
    return;
  }

  if (hasNameChange) {
    user.fullName = updatedName;
    currentUser.fullName = updatedName;
  }

  if (hasPhotoChange) {
    user.profilePhoto = editPhotoData;
    currentUser.profilePhoto = editPhotoData;
  }

  users[key] = user;
  saveUsers(users);

  updateProfileBadge();
  setFeedback(editProfileFeedback, "Perfil atualizado com sucesso.", "success");
  window.setTimeout(() => closeModal(editProfileModal), 800);
});

openForgotPasswordBtn.addEventListener("click", () => {
  forgotPasswordEmail.value = document.getElementById("loginEmail").value.trim();
  setFeedback(forgotPasswordFeedback, "");
  openModal(forgotPasswordModal);
});

closeForgotPasswordBtn.addEventListener("click", () => closeModal(forgotPasswordModal));
cancelForgotPasswordBtn.addEventListener("click", () => closeModal(forgotPasswordModal));

forgotPasswordModal.addEventListener("click", (event) => {
  if (event.target === forgotPasswordModal) closeModal(forgotPasswordModal);
});

forgotPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFeedback(forgotPasswordFeedback, "");

  const email = forgotPasswordEmail.value.trim();
  if (!email) {
    setFeedback(forgotPasswordFeedback, "Informe um e-mail válido.", "error");
    return;
  }

  try {
    await requestPasswordResetEmail(email);
    setFeedback(
      forgotPasswordFeedback,
      "Solicitação enviada. Verifique seu e-mail para redefinir sua senha.",
      "success",
    );
    forgotPasswordForm.reset();
  } catch (error) {
    setFeedback(forgotPasswordFeedback, error.message, "error");
  }
});

resetPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFeedback(resetPasswordFeedback, "");

  const newPassword = resetPasswordInput.value;
  const confirmPassword = resetPasswordConfirmInput.value;

  if (!pendingResetToken || !pendingResetEmail) {
    setFeedback(resetPasswordFeedback, "Link de redefinição inválido.", "error");
    return;
  }

  if (newPassword !== confirmPassword) {
    setFeedback(resetPasswordFeedback, "As senhas devem ser iguais.", "error");
    return;
  }

  if (!newPassword) {
    setFeedback(resetPasswordFeedback, "A nova senha não pode ficar vazia.", "error");
    return;
  }

  const users = loadUsers();
  const key = normalizeEmail(pendingResetEmail);
  const user = users[key];

  if (!user) {
    setFeedback(resetPasswordFeedback, "Conta não encontrada neste dispositivo.", "error");
    return;
  }

  try {
    await validateResetToken(pendingResetToken, pendingResetEmail);

    user.password = newPassword;
    users[key] = user;
    saveUsers(users);

    if (currentUser && normalizeEmail(currentUser.email) === key) {
      currentUser.password = newPassword;
    }

    pendingResetToken = "";
    pendingResetEmail = "";
    setFeedback(resetPasswordFeedback, "Senha redefinida com sucesso.", "success");

    clearResetQueryParams();

    window.setTimeout(() => {
      closeModal(resetPasswordModal);
      resetPasswordForm.reset();
      showAuth("login");
      setFeedback(loginFeedback, "Sua senha foi redefinida. Faça login com a nova senha.", "success");
    }, 800);
  } catch (error) {
    setFeedback(resetPasswordFeedback, error.message, "error");
  }
});

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(savedTheme);
}

function bootstrap() {
  applyAvatarPreview(registerProfilePhotoLabel, registerProfilePhotoPreview, "", "");
  bindPasswordToggles();
  initializeTheme();

  window.setTimeout(() => {
    introSplash.classList.add("fade-out");

    const users = loadUsers();
    const activeSession = loadSession();

    if (activeSession && users[activeSession.email]) {
      showAppForUser(users[activeSession.email]);
    } else {
      showAuth("login");
    }

    maybeOpenResetModalFromLink();

    window.setTimeout(() => {
      introSplash.remove();
    }, 400);
  }, 1000);
}

bootstrap();
