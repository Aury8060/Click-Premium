import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAZyQWczKU4e6w6FFiAl_jaS-7jt9TR2KM",
    authDomain: "loja-cell.firebaseapp.com",
    projectId: "loja-cell",
    storageBucket: "loja-cell.firebasestorage.app",
    messagingSenderId: "309944522643",
    appId: "1:309944522643:web:2202a9541264aa2170ba66",
    measurementId: "G-3JKML1BBF0"
};

const appFirebase = initializeApp(firebaseConfig);
const db = getDatabase(appFirebase);

// ==========================================
// SAAS: DETECÇÃO DA LOJA E PERSISTÊNCIA
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const isRootUrl = !window.location.search.includes('loja=');
const CURRENT_STORE = urlParams.get('loja') || 'padrao';

const dbPath = (node) => CURRENT_STORE === 'padrao' ? node : 'lojas/' + CURRENT_STORE + '/' + node;
const CART_KEY = 'cellCart_' + CURRENT_STORE;
const USER_KEY = 'cellUser_' + CURRENT_STORE;

const state = {
    cart: JSON.parse(localStorage.getItem(CART_KEY)) || [],
    currentUser: JSON.parse(localStorage.getItem(USER_KEY)) || null,
    
    adminRole: localStorage.getItem('cellAdminRole'),
    isAdminLoggedIn: localStorage.getItem('cellAdminRole') !== null,
    
    products: {}, 
    allOrders: {},
    currentCategory: 'Todos',
    gallery: { images: [], index: 0 },
    tempVariants: [],
    currentVarBuilder: { colors: [], extraLinks: [] },
    salesChart: null
};

// ==========================================
// NOTIFICAÇÕES (TOAST)
// ==========================================
function customAlert(title, message, type) {
    if(!type) type = 'success';
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    
    let icon = 'fa-info-circle';
    if(type === 'success') icon = 'fa-check-circle';
    if(type === 'error') icon = 'fa-exclamation-circle';

    toast.innerHTML = '<i class="fas ' + icon + '"></i><div class="toast-content"><strong>' + title + '</strong><p>' + message + '</p></div>';
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// ==========================================
// ROTEADOR E UI
// ==========================================
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewElement = document.getElementById('view-' + viewId);
    if (viewElement) viewElement.classList.add('active');
    
    localStorage.setItem('lastAppView_' + CURRENT_STORE, viewId);
    
    if(viewId === 'catalog') filterProducts(); 
    if(viewId === 'cart') renderCart();
    if(viewId === 'my-orders') loadClientOrders();
    updateNavbar();
}

function showAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
    const targetTab = document.getElementById('admin-tab-' + tab);
    if(targetTab) targetTab.style.display = 'block';
    
    localStorage.setItem('lastAdminTab_' + CURRENT_STORE, tab);
    if(tab === 'dash') filterDashboard(); 
}

function updateCartStorage() {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

function updateNavbar() {
    if(isRootUrl) return; 
    document.getElementById('cart-count').innerText = state.cart.length;
    const userBtn = document.getElementById('nav-user-btn');
    const adminBtn = document.getElementById('nav-admin-btn');
    const adminLogoutBtn = document.getElementById('nav-admin-logout');
    const ordersBtn = document.getElementById('nav-orders-btn');
    const usersTabBtn = document.getElementById('nav-tab-users');

    if (state.currentUser) {
        userBtn.innerHTML = '<i class="fas fa-user-check"></i> ' + state.currentUser.name.split(' ')[0];
        userBtn.onclick = () => showView('cart');
        if(ordersBtn) ordersBtn.style.display = 'inline-block';
    } else {
        userBtn.innerHTML = '<i class="fas fa-user"></i> Entrar';
        userBtn.onclick = () => showView('login');
        if(ordersBtn) ordersBtn.style.display = 'none';
    }

    if (state.isAdminLoggedIn) {
        adminBtn.style.color = "var(--primary)";
        adminLogoutBtn.style.display = "inline-block";
        if(state.adminRole === 'superadmin' && usersTabBtn) {
            usersTabBtn.style.display = 'block';
        }
    } else {
        adminBtn.style.color = "#94a3b8";
        adminLogoutBtn.style.display = "none";
        if(usersTabBtn) usersTabBtn.style.display = 'none';
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}
function sanitizeEmail(email) { return btoa(email); }

// ==========================================
// LOGIN GLOBAL (PORTAL DE ENTRADA)
// ==========================================
async function processGlobalLogin() {
    const u = document.getElementById('global-email').value.trim().toLowerCase();
    const p = document.getElementById('global-pass').value.trim();

    if(!u || !p) return customAlert("Aviso", "Preencha usuário e senha.", "info");

    if(u === 'au.costa' && p === '80605276') {
        localStorage.setItem('cellAdminRole', 'superadmin');
        localStorage.setItem('lastAppView_padrao', 'admin-panel');
        localStorage.setItem('lastAdminTab_padrao', 'dash');
        window.location.href = '?loja=padrao';
        return;
    }

    const adminSnap = await get(ref(db, 'global_admins/' + btoa(u)));
    if(adminSnap.exists() && adminSnap.val().password === p) {
        const storeId = adminSnap.val().storeId;
        localStorage.setItem('cellAdminRole', 'admin');
        localStorage.setItem('lastAppView_' + storeId, 'admin-panel');
        localStorage.setItem('lastAdminTab_' + storeId, 'dash');
        window.location.href = '?loja=' + storeId;
        return;
    }

    let foundStore = null;
    let clientData = null;

    if (u.includes('@')) {
        const clientSnapPadrao = await get(ref(db, 'clientes/' + btoa(u)));
        if(clientSnapPadrao.exists() && clientSnapPadrao.val().password === p) {
            foundStore = 'padrao';
            clientData = clientSnapPadrao.val();
        } else {
            const lojasSnap = await get(ref(db, 'lojas'));
            if(lojasSnap.exists()) {
                const lojas = lojasSnap.val();
                for(let storeKey in lojas) {
                    if(lojas[storeKey].clientes && lojas[storeKey].clientes[btoa(u)]) {
                        if(lojas[storeKey].clientes[btoa(u)].password === p) {
                            foundStore = storeKey;
                            clientData = lojas[storeKey].clientes[btoa(u)];
                            break;
                        }
                    }
                }
            }
        }
    }

    if(foundStore && clientData) {
        localStorage.setItem('cellUser_' + foundStore, JSON.stringify(clientData));
        localStorage.setItem('lastAppView_' + foundStore, 'catalog');
        window.location.href = '?loja=' + foundStore;
    } else {
        customAlert("Acesso Negado", "E-mail/Usuário ou senha inválidos, ou loja não encontrada.", "error");
    }
}

// ==========================================
// CATÁLOGO E PRODUTOS
// ==========================================
function renderCategoryButtons() {
    const categories = new Set(['Todos']);
    Object.values(state.products).forEach(p => {
        if(p.category) categories.add(p.category.toUpperCase());
    });
    const filterContainer = document.getElementById('category-filters');
    filterContainer.innerHTML = '';
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'cat-btn ' + (state.currentCategory === cat ? 'active' : '');
        btn.innerText = cat;
        btn.onclick = () => {
            state.currentCategory = cat;
            renderCategoryButtons(); 
            filterProducts();
        };
        filterContainer.appendChild(btn);
    });
}

function filterProducts() {
    const term = document.getElementById('search-input').value.toLowerCase();
    const grid = document.getElementById('product-grid');
    grid.innerHTML = '';

    const filtered = Object.entries(state.products).filter(([id, p]) => {
        const matchTerm = p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term);
        const matchCat = state.currentCategory === 'Todos' || p.category.toUpperCase() === state.currentCategory;
        return matchTerm && matchCat;
    });

    if(filtered.length === 0) {
        grid.innerHTML = '<p style="color: #64748b; font-size: 1.1rem;">Nenhum produto encontrado nesta loja no momento.</p>';
        return;
    }

    filtered.forEach(([id, p]) => {
        const imgAction = 'onclick="app.openGallery(\'' + id + '\')" title="Ver fotos"';
        let optionsHtml = ''; let colorHtml = '';
        let displayPrice = parseFloat(p.price) || 0; let displayImg = p.image;

        if (p.variants && p.variants.length > 0) {
            const firstVar = p.variants[0];
            displayPrice = parseFloat(firstVar.price) || 0;
            if (firstVar.mainImage) displayImg = firstVar.mainImage;

            let optionsList = "";
            p.variants.forEach((v, i) => {
                let label = v.size || 'Padrão';
                if(v.ram) label += ' / ' + v.ram;
                optionsList += '<option value="' + i + '">' + label + '</option>';
            });
            optionsHtml = '<select id="select-var-' + id + '" class="variant-select" onchange="app.changeProductPrice(\'' + id + '\', this.value)" style="margin-bottom: 5px;">' + optionsList + '</select>';

            if (firstVar.colors && firstVar.colors.length > 0) {
                let colorsList = "";
                firstVar.colors.forEach(c => { colorsList += '<option value="' + c + '">' + c + '</option>'; });
                colorHtml = '<select id="select-color-' + id + '" class="variant-select color-select">' + colorsList + '</select>';
            } else {
                colorHtml = '<select id="select-color-' + id + '" class="variant-select color-select" style="display:none;"><option value="">Padrão</option></select>';
            }
        } else {
            optionsHtml = '<input type="hidden" id="select-var-' + id + '" value="-1">';
            colorHtml = '<input type="hidden" id="select-color-' + id + '" value="">';
        }

        grid.innerHTML += `
            <div class="product-card">
                <img src="${displayImg}" class="product-img" id="img-display-${id}" alt="${p.name}" ${imgAction}>
                <div class="product-info">
                    <div class="product-title">${p.name}</div>
                    <div class="product-specs">${p.specs}</div>
                    ${optionsHtml} 
                    ${colorHtml}
                    <div class="product-price" id="price-display-${id}">R$ ${displayPrice.toFixed(2)}</div>
                    <button class="btn-primary" onclick="app.addToCartSelected('${id}')">Adicionar ao Carrinho</button>
                </div>
            </div>`;
    });
}

function changeProductPrice(id, variantIndex) {
    const p = state.products[id];
    if(!p || !p.variants || variantIndex === "-1") return;
    const v = p.variants[variantIndex];
    document.getElementById('price-display-' + id).innerText = 'R$ ' + (parseFloat(v.price) || 0).toFixed(2);
    
    const imgEl = document.getElementById('img-display-' + id);
    if(imgEl) imgEl.src = v.mainImage ? v.mainImage : p.image;
    
    const colorSelect = document.getElementById('select-color-' + id);
    if(colorSelect) {
        if(v.colors && v.colors.length > 0) {
            let colorsList = "";
            v.colors.forEach(c => { colorsList += '<option value="' + c + '">' + c + '</option>'; });
            colorSelect.innerHTML = colorsList;
            colorSelect.style.display = 'block';
        } else {
            colorSelect.innerHTML = '<option value="">Padrão</option>';
            colorSelect.style.display = 'none';
        }
    }
}

function addToCartSelected(id) {
    const p = state.products[id];
    const selectVar = document.getElementById('select-var-' + id);
    const selectColor = document.getElementById('select-color-' + id);
    
    let finalName = p.name;
    let finalPrice = parseFloat(p.price) || 0;
    let selectedColor = selectColor && selectColor.style.display !== 'none' ? selectColor.value : '';

    if (p.variants && p.variants.length > 0) {
        const v = p.variants[selectVar.value];
        let varDesc = v.size || 'Padrão';
        if(v.ram) varDesc += ' / ' + v.ram;
        if(selectedColor) varDesc += ' - Cor: ' + selectedColor;
        finalName = p.name + ' (' + varDesc + ')';
        finalPrice = parseFloat(v.price) || 0;
    } else if (selectedColor) {
        finalName = p.name + ' (Cor: ' + selectedColor + ')';
    }

    state.cart.push({ id, name: finalName, price: finalPrice });
    updateCartStorage();
    customAlert("Item Adicionado", finalName + " foi para o seu carrinho.", "success");
    updateNavbar();
}

// ==========================================
// GALERIA
// ==========================================
function openGallery(id) {
    const p = state.products[id];
    if(!p) return;
    let images = [];
    const selectVar = document.getElementById('select-var-' + id);
    if (selectVar && selectVar.value !== "-1" && p.variants) {
        const v = p.variants[selectVar.value];
        if (v.mainImage) images.push(v.mainImage);
        if (v.extraImages && v.extraImages.length > 0) images = images.concat(v.extraImages);
    }
    if (images.length === 0) {
        if (p.image) images.push(p.image);
        if (p.extraImages && p.extraImages.length > 0) images = images.concat(p.extraImages);
    }
    if(images.length > 0) {
        state.gallery.images = images; state.gallery.index = 0;
        updateGalleryUI();
        document.getElementById('gallery-modal').style.display = 'flex';
    }
}
function updateGalleryUI() {
    document.getElementById('gallery-img').src = state.gallery.images[state.gallery.index];
    document.getElementById('gallery-counter').innerText = (state.gallery.index + 1) + ' / ' + state.gallery.images.length;
}
function prevImage() { state.gallery.index = state.gallery.index > 0 ? state.gallery.index - 1 : state.gallery.images.length - 1; updateGalleryUI(); }
function nextImage() { state.gallery.index = state.gallery.index < state.gallery.images.length - 1 ? state.gallery.index + 1 : 0; updateGalleryUI(); }
function closeGallery() { document.getElementById('gallery-modal').style.display = 'none'; }

// ==========================================
// CLIENTE (AUTH E PEDIDOS)
// ==========================================
function toggleClientAuthMode() {
    const loginForm = document.getElementById('client-login-form');
    const regForm = document.getElementById('client-register-form');
    if(loginForm.style.display === 'none') { loginForm.style.display = 'block'; regForm.style.display = 'none'; } 
    else { loginForm.style.display = 'none'; regForm.style.display = 'block'; }
}

async function registerClient() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const address = document.getElementById('reg-address').value;
    const password = document.getElementById('reg-pass').value;

    if(!name || !email || !password || !phone) return customAlert("Aviso", "Preencha os campos obrigatórios!", "info");
    const clientId = sanitizeEmail(email);
    const clientData = { name, email, phone, address, password };

    await set(ref(db, dbPath('clientes/' + clientId)), clientData);
    state.currentUser = clientData;
    localStorage.setItem(USER_KEY, JSON.stringify(clientData));
    customAlert("Boas Vindas!", "Cadastro realizado com sucesso.", "success");
    showView('catalog');
}

async function loginClient() {
    const email = document.getElementById('cli-email').value.trim();
    const pass = document.getElementById('cli-pass').value.trim();
    const snapshot = await get(ref(db, dbPath('clientes/' + sanitizeEmail(email))));
    
    if (snapshot.exists() && snapshot.val().password === pass) {
        state.currentUser = snapshot.val();
        localStorage.setItem(USER_KEY, JSON.stringify(snapshot.val()));
        customAlert("Bem-vindo de volta!", "Login efetuado.", "success");
        showView('catalog');
    } else { customAlert("Acesso Negado", "Email ou Senha incorretos.", "error"); }
}

function loadClientOrders() {
    if(!state.currentUser) return;
    const list = document.getElementById('client-orders-list');
    list.innerHTML = '';
    
    const myOrders = Object.entries(state.allOrders).filter(([id, o]) => o.client.email === state.currentUser.email).reverse();

    if(myOrders.length === 0) {
        list.innerHTML = '<p>Você ainda não fez nenhum pedido nesta loja.</p>';
        return;
    }

    myOrders.forEach(([id, o]) => {
        let itemsHtml = "";
        o.items.forEach(i => { itemsHtml += '<br> - ' + i.name; });
        
        let statusBadge = '<span class="badge badge-status" style="background:#e2e8f0; color:#333;">' + o.status + '</span>';
        if(o.status.includes('Despacho') || o.status.includes('Caminho')) statusBadge = '<span class="badge badge-status" style="background:var(--info); color:white;">' + o.status + '</span>';
        if(o.status.includes('Concluído') || o.status.includes('Recebido') || o.status.includes('Entregue')) statusBadge = '<span class="badge badge-status" style="background:var(--success); color:white;">' + o.status + '</span>';

        let extraAction = '';
        if(o.status === 'Despachado' || o.status === 'Pagamento Aprovado - Em Despacho') {
            const days = o.deliveryDays || 'N/A';
            extraAction = `
                <div style="background:#f0fdf4; padding:15px; border-radius:8px; border:1px solid #bbf7d0; margin-top:10px;">
                    <p style="color:var(--success); font-weight:bold; margin-bottom:10px;"><i class="fas fa-truck"></i> Previsão de entrega: ${days} dias</p>
                    <button onclick="app.clientConfirmReceipt('${id}')" class="btn-success">Recebi meu Pedido Perfeitamente</button>
                </div>
            `;
        }

        list.innerHTML += `
            <div class="client-order-card">
                <div class="client-order-header">
                    <div>
                        <small style="color:#64748b;">Pedido feito em: ${o.dateStr || o.date}</small>
                        <h3 style="margin-top:5px;">Total: R$ ${o.total.toFixed(2)}</h3>
                    </div>
                    <div>${statusBadge}</div>
                </div>
                <div style="font-size: 0.9rem; color: #475569;">
                    <strong>Produtos:</strong>${itemsHtml}
                </div>
                ${extraAction}
            </div>
        `;
    });
}

function clientConfirmReceipt(orderId) {
    if(confirm("Confirmar que você recebeu este pedido perfeitamente? O lojista será notificado.")) {
        update(ref(db, dbPath('vendas/' + orderId)), { status: "Entregue pelo Cliente" });
        customAlert("Obrigado!", "Sua compra foi finalizada com sucesso.", "success");
    }
}

// ==========================================
// CHECKOUT E PIX
// ==========================================
function renderCart() {
    const list = document.getElementById('cart-items');
    list.innerHTML = '';
    let total = 0;
    
    if(state.cart.length === 0) {
        list.innerHTML = '<p style="color: #64748b; font-size: 1.1rem;">Seu carrinho está vazio.</p>';
        document.getElementById('checkout-step').style.display = 'none';
        document.getElementById('btn-start-checkout').style.display = 'none';
    } else {
        state.cart.forEach((item, index) => {
            total += parseFloat(item.price);
            list.innerHTML += `
                <div class="cart-item">
                    <span>${item.name}</span>
                    <div>
                        <span>R$ ${parseFloat(item.price).toFixed(2)}</span>
                        <button onclick="app.removeFromCart(${index})" style="margin-left: 10px; color: red; border: none; background: none; cursor: pointer; font-size: 1.2rem;"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            `;
        });
        document.getElementById('btn-start-checkout').style.display = 'block';
    }
    document.getElementById('cart-total-price').innerText = total.toFixed(2);
}

function removeFromCart(index) { 
    state.cart.splice(index, 1); 
    updateCartStorage(); 
    renderCart(); 
    updateNavbar(); 
}

function crc16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
            else crc = crc << 1;
        }
        crc &= 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function generatePixPayload(pixKey, amount) {
    const f = (id, val) => { const str = String(val); return id + str.length.toString().padStart(2, '0') + str; };
    let p = "000201";
    p += f("26", f("00", "br.gov.bcb.pix") + f("01", pixKey));
    p += f("52", "0000"); p += f("53", "986"); p += f("54", amount.toFixed(2));
    p += f("58", "BR"); p += f("59", "LOJISTA"); p += f("60", "CIDADE"); p += f("62", f("05", "***")); p += "6304";
    p += crc16(p);
    return p;
}

async function startCheckout() {
    if(!state.currentUser) return showView('login');
    if(state.cart.length === 0) return customAlert("Atenção", "Carrinho Vazio.", "info");
    
    const snap = await get(ref(db, dbPath('config/pixKey')));
    let pixKey = snap.exists() ? snap.val() : "";
    if(!pixKey) return customAlert("Erro na Loja", "O lojista ainda não configurou uma chave PIX para receber.", "error");

    const total = state.cart.reduce((acc, item) => acc + parseFloat(item.price), 0);
    const pixPayload = generatePixPayload(pixKey, total);
    
    document.getElementById('pix-total-display').innerText = total.toFixed(2);
    document.getElementById('pix-payload-input').value = pixPayload;
    document.getElementById('pix-qrcode').src = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(pixPayload);
    
    document.getElementById('checkout-step').style.display = 'block';
    document.getElementById('btn-start-checkout').style.display = 'none';
}

function copyPixPayload() {
    const input = document.getElementById('pix-payload-input');
    input.select(); input.setSelectionRange(0, 99999); 
    navigator.clipboard.writeText(input.value).then(() => {
        customAlert("Chave Copiada", "Cole no aplicativo do seu banco para pagar.", "success");
    }).catch(() => {
        customAlert("Aviso", "Erro ao copiar, selecione manualmente.", "info");
    });
}

async function finishCheckout() {
    const fileInput = document.getElementById('receipt-file');
    if(fileInput.files.length === 0) return customAlert("Atenção", "Por favor, anexe o comprovante do PIX.", "error");

    const base64Receipt = await fileToBase64(fileInput.files[0]);
    const total = state.cart.reduce((acc, item) => acc + parseFloat(item.price), 0);
    
    const now = new Date();
    const orderData = {
        client: state.currentUser,
        items: state.cart,
        total: total,
        receipt: base64Receipt,
        status: "Aguardando Validação",
        timestamp: now.getTime(),
        dateStr: now.toLocaleDateString('pt-BR'),
        date: now.toLocaleString()
    };

    await set(push(ref(db, dbPath('vendas'))), orderData);
    customAlert("Pedido Recebido!", "O administrador validará o seu PIX. Acompanhe em Meus Pedidos.", "success");
    
    state.cart = []; 
    updateCartStorage(); 
    renderCart(); 
    showView('my-orders');
}

// ==========================================
// ÁREA DO ADMINISTRADOR
// ==========================================
async function loginAdmin() {
    const u = document.getElementById('admin-user').value.trim().toLowerCase();
    const p = document.getElementById('admin-pass').value.trim();
    
    if(!u || !p) return customAlert("Aviso", "Preencha usuário e senha.", "info");

    if(u === 'au.costa' && p === '80605276') {
        localStorage.setItem('lastAppView_padrao', 'admin-panel');
        localStorage.setItem('lastAdminTab_padrao', 'dash');
        processAdminLogin('superadmin');
    } else {
        const snap = await get(ref(db, 'global_admins/' + btoa(u)));
        if (snap.exists() && snap.val().password === p) {
            const adminData = snap.val();
            if(adminData.storeId !== CURRENT_STORE && !isRootUrl) {
                customAlert("Redirecionando...", "Indo para o painel da sua loja.", "info");
                localStorage.setItem('lastAppView_' + adminData.storeId, 'admin-panel');
                localStorage.setItem('lastAdminTab_' + adminData.storeId, 'dash');
                setTimeout(() => window.location.href = '?loja=' + adminData.storeId, 1500);
                return;
            }
            localStorage.setItem('lastAppView_' + adminData.storeId, 'admin-panel');
            localStorage.setItem('lastAdminTab_' + adminData.storeId, 'dash');
            processAdminLogin('admin');
        } else {
            customAlert("Acesso Negado", "Usuário ou senha inválidos.", "error");
        }
    }
}

function processAdminLogin(role) {
    state.isAdminLoggedIn = true;
    state.adminRole = role;
    localStorage.setItem('cellAdminRole', role);
    
    updateNavbar();
    showView('admin-panel');
    showAdminTab('dash');
    loadAdminProducts();
    loadAdminOrders();

    const usrBtn = document.getElementById('nav-tab-users');
    if(role === 'superadmin') {
        if(usrBtn) usrBtn.style.display = 'block';
        loadSystemUsers();
    } else {
        if(usrBtn) usrBtn.style.display = 'none';
    }

    get(ref(db, dbPath('config/pixKey'))).then(snap => {
        if(snap.exists() && document.getElementById('admin-pix-key')) document.getElementById('admin-pix-key').value = snap.val();
    });
}

function logoutAdmin() {
    state.isAdminLoggedIn = false;
    state.adminRole = null;
    localStorage.removeItem('cellAdminRole');
    updateNavbar(); 
    showView('catalog');
}

function saveStoreConfig() {
    const pix = document.getElementById('admin-pix-key').value.trim();
    const name = document.getElementById('admin-store-name').value.trim();
    const color = document.getElementById('admin-theme-color').value;
    update(ref(db, dbPath('config')), { pixKey: pix, storeName: name, themeColor: color });
    customAlert("Pronto!", "Configurações da loja salvas com sucesso.", "success");
}

// === SaaS (Gestão de Lojas) ===

function editTenantStore(key) {
    get(ref(db, 'global_admins/' + key)).then(snap => {
        if(snap.exists()) {
            const data = snap.val();
            document.getElementById('sys-edit-key').value = key;
            document.getElementById('sys-store-name').value = data.storeName;
            
            document.getElementById('sys-store-slug').value = data.storeId;
            document.getElementById('sys-store-slug').disabled = true; // Slug define banco, não deve ser mudado fácil
            
            document.getElementById('sys-user').value = data.username;
            document.getElementById('sys-user').disabled = true; // Usuário define chave, não deve ser mudado
            
            document.getElementById('sys-pass').value = data.password;

            document.getElementById('btn-save-tenant').innerText = "Salvar Alterações";
            document.getElementById('btn-cancel-tenant').style.display = "inline-block";
            window.scrollTo(0, document.getElementById('admin-tab-users').offsetTop);
        }
    });
}

function cancelEditTenant() {
    document.getElementById('sys-edit-key').value = '';
    document.getElementById('sys-store-name').value = '';
    
    document.getElementById('sys-store-slug').value = '';
    document.getElementById('sys-store-slug').disabled = false;
    
    document.getElementById('sys-user').value = '';
    document.getElementById('sys-user').disabled = false;
    
    document.getElementById('sys-pass').value = '';

    document.getElementById('btn-save-tenant').innerText = "Criar Nova Loja";
    document.getElementById('btn-cancel-tenant').style.display = "none";
}

function saveTenantStore() {
    const editKey = document.getElementById('sys-edit-key').value;
    const name = document.getElementById('sys-store-name').value.trim();
    const slug = document.getElementById('sys-store-slug').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const u = document.getElementById('sys-user').value.trim().toLowerCase();
    const p = document.getElementById('sys-pass').value.trim();
    
    if(!name || !slug || !u || !p) return customAlert("Erro", "Preencha todos os campos da loja.", "error");
    if(u === 'au.costa' && !editKey) return customAlert("Inválido", "Este usuário é reservado.", "error");

    const key = editKey ? editKey : btoa(u);

    // Salva ou atualiza
    set(ref(db, 'global_admins/' + key), { username: u, password: p, storeId: slug, storeName: name });
    
    if(editKey) {
        update(ref(db, 'lojas/' + slug + '/config'), { storeName: name });
        customAlert("Atualizado!", "Loja e senha do administrador atualizados com sucesso.", "success");
    } else {
        set(ref(db, 'lojas/' + slug + '/config'), { storeName: name, themeColor: '#2563eb' });
        customAlert("Loja Criada!", "O link da loja é: ?loja=" + slug, "success");
    }
    
    cancelEditTenant();
    loadSystemUsers();
}

function loadSystemUsers() {
    onValue(ref(db, 'global_admins'), snap => {
        const tbody = document.getElementById('admin-users-list');
        if(!tbody) return;
        tbody.innerHTML = '';
        if(snap.exists()) {
            const admins = snap.val();
            Object.keys(admins).forEach(key => {
                const admin = admins[key];
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${admin.storeName}</strong></td>
                        <td>?loja=${admin.storeId}</td>
                        <td>${admin.username}</td>
                        <td class="action-btns">
                            <button onclick="app.editTenantStore('${key}')" class="btn-warning"><i class="fas fa-edit"></i></button>
                            <button onclick="app.deleteTenantStore('${key}')" class="btn-danger"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
    });
}

function deleteTenantStore(key) {
    if(confirm("Deseja deletar permanentemente o acesso desse lojista?")) {
        remove(ref(db, 'global_admins/' + key));
        customAlert("Excluído", "Permissão removida com sucesso.", "info");
    }
}

// === Importar Produtos em JSON ===
function importProductsJSON() {
    const fileInput = document.getElementById('import-json-file');
    if(fileInput.files.length === 0) return customAlert("Atenção", "Selecione um arquivo .json", "info");

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            let count = 0;
            if (Array.isArray(data)) {
                for(let item of data) { await set(push(ref(db, dbPath('estoque'))), item); count++; }
            } else if (typeof data === 'object') {
                for(let key in data) { await set(ref(db, dbPath('estoque/' + key)), data[key]); count++; }
            }
            customAlert("Upload Concluído", count + " produtos foram importados com sucesso!", "success");
            fileInput.value = '';
        } catch (err) {
            customAlert("Erro no Arquivo", "Não foi possível ler o JSON. Verifique o formato.", "error");
        }
    };
    reader.readAsText(fileInput.files[0]);
}


function openReceipt(base64) {
    document.getElementById('receipt-img').src = base64;
    document.getElementById('receipt-modal').style.display = 'flex';
}

function loadAdminOrders() {
    const tbody = document.getElementById('admin-orders-list');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const activeOrders = Object.entries(state.allOrders).filter(([id, o]) => o.status !== "Concluído").reverse();

    if(activeOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Nenhuma venda em andamento no momento.</td></tr>';
        return;
    }

    activeOrders.forEach(([id, o]) => {
        let itemsHtml = "";
        o.items.forEach(i => { itemsHtml += '<br>- ' + i.name; });
        
        let actionBtn = '';
        if (o.status === "Aguardando Validação") {
            actionBtn = `<button onclick="app.approveOrder('${id}')" class="btn-primary" style="margin-bottom:5px;"><i class="fas fa-truck"></i> Aprovar/Despachar</button>`;
        } else if (o.status === "Entregue pelo Cliente") {
            actionBtn = `<button onclick="app.completeOrder('${id}')" class="btn-success"><i class="fas fa-check-double"></i> Concluir Venda</button>`;
        } else {
            actionBtn = `<span style="font-size:0.85rem; color:#64748b;">Aguardando o cliente...</span>`;
        }

        tbody.innerHTML += `
            <tr>
                <td><small>${o.dateStr || o.date}</small></td>
                <td><strong>${o.client.name}</strong><br><small>${o.client.phone}</small></td>
                <td><strong style="color:var(--success);">R$ ${o.total.toFixed(2)}</strong></td>
                <td><b>${o.status}</b><br><a href="#" onclick="app.openReceipt('${o.receipt}')" style="font-size:0.85rem;">Ver Comprovante</a></td>
                <td class="action-btns">${actionBtn}</td>
            </tr>
        `;
    });
}

function approveOrder(id) {
    const dias = prompt("Previsão de entrega (Apenas números, em dias):");
    if(dias && !isNaN(dias)) {
        update(ref(db, dbPath('vendas/' + id)), { status: "Despachado", deliveryDays: dias });
        customAlert("Despachado", "Cliente notificado da previsão.", "success");
    }
}

function completeOrder(id) {
    if(confirm("Confirmar a conclusão? O pedido irá para o Histórico de Vendas do Dashboard.")) {
        update(ref(db, dbPath('vendas/' + id)), { status: "Concluído" });
    }
}

function filterDashboard() {
    const startInput = document.getElementById('dash-start').value;
    const endInput = document.getElementById('dash-end').value;
    let startTimestamp = 0; let endTimestamp = Number.MAX_SAFE_INTEGER;
    if(startInput) { const s = new Date(startInput + 'T00:00:00'); startTimestamp = s.getTime(); }
    if(endInput) { const e = new Date(endInput + 'T23:59:59'); endTimestamp = e.getTime(); }

    const completedOrders = Object.values(state.allOrders).filter(o => {
        if(o.status !== "Concluído") return false;
        const ts = o.timestamp || 0; 
        return ts >= startTimestamp && ts <= endTimestamp;
    });

    let totalRevenue = 0;
    const salesByDate = {};
    const historyTbody = document.getElementById('dash-history-list');
    historyTbody.innerHTML = '';

    completedOrders.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).forEach(o => {
        totalRevenue += o.total;
        const dateKey = o.dateStr || "Data Antiga";
        salesByDate[dateKey] = (salesByDate[dateKey] || 0) + o.total;
        
        let itemsHist = "";
        o.items.forEach(i => { itemsHist += i.name + ", "; });

        historyTbody.innerHTML += `
            <tr>
                <td>${dateKey}</td>
                <td>${o.client.name} <br> <small>${o.client.phone}</small></td>
                <td><small>${itemsHist}</small></td>
                <td><strong style="color:var(--success);">R$ ${o.total.toFixed(2)}</strong></td>
            </tr>
        `;
    });

    if(completedOrders.length === 0) historyTbody.innerHTML = '<tr><td colspan="4">Nenhuma venda concluída no período.</td></tr>';

    document.getElementById('dash-total-val').innerText = 'R$ ' + totalRevenue.toFixed(2);
    document.getElementById('dash-total-orders').innerText = completedOrders.length;
    renderChart(salesByDate);
}

function renderChart(dataObj) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('salesChart');
    const labels = Object.keys(dataObj).reverse(); 
    const data = labels.map(l => dataObj[l]);

    if(state.salesChart) state.salesChart.destroy(); 
    state.salesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length > 0 ? labels : ['Sem dados'],
            datasets: [{ label: 'Faturamento (R$)', data: data.length > 0 ? data : [0], backgroundColor: 'var(--primary)', borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

// === LÓGICA DE PRODUTOS ===
function addVarColor() {
    const color = document.getElementById('var-color-input').value.trim();
    if(!color) return; state.currentVarBuilder.colors.push(color);
    document.getElementById('var-color-input').value = ''; renderVarBuilderLists();
}
function removeVarColor(index) { state.currentVarBuilder.colors.splice(index, 1); renderVarBuilderLists(); }
function addVarExtraLink() {
    const link = document.getElementById('var-extra-img-link').value.trim();
    if(!link) return; state.currentVarBuilder.extraLinks.push(link);
    document.getElementById('var-extra-img-link').value = ''; renderVarBuilderLists();
}
function removeVarExtraLink(index) { state.currentVarBuilder.extraLinks.splice(index, 1); renderVarBuilderLists(); }

function renderVarBuilderLists() {
    let colorHtml = "";
    state.currentVarBuilder.colors.forEach((c, i) => { colorHtml += '<span class="badge badge-color">' + c + ' <i class="fas fa-times" onclick="app.removeVarColor(' + i + ')" style="cursor:pointer; margin-left:3px;"></i></span>'; });
    document.getElementById('var-colors-list').innerHTML = colorHtml;

    let linkHtml = "";
    state.currentVarBuilder.extraLinks.forEach((l, i) => { linkHtml += '<span class="badge badge-link">Link Adicionado <i class="fas fa-times" onclick="app.removeVarExtraLink(' + i + ')" style="cursor:pointer; margin-left:3px;"></i></span>'; });
    document.getElementById('var-links-list').innerHTML = linkHtml;
}

async function addVariant() {
    const storage = document.getElementById('var-storage').value.trim();
    const ram = document.getElementById('var-ram').value.trim();
    const price = parseFloat(document.getElementById('var-price').value);
    const mainImg = document.getElementById('var-main-img').value.trim();
    if(!storage || isNaN(price)) return customAlert("Atenção", "Preço e armazenamento são obrigatórios.", "info");
    
    let extraImages = [...state.currentVarBuilder.extraLinks];
    const fileInput = document.getElementById('var-extra-img-file');
    if(fileInput.files.length > 0) {
        for(let i=0; i < fileInput.files.length; i++) extraImages.push(await fileToBase64(fileInput.files[i]));
    }
    
    state.tempVariants.push({ size: storage, ram: ram, price: price, colors: [...state.currentVarBuilder.colors], mainImage: mainImg, extraImages: extraImages });
    state.currentVarBuilder = { colors: [], extraLinks: [] };
    
    document.getElementById('var-storage').value = ''; document.getElementById('var-ram').value = ''; document.getElementById('var-price').value = '';
    document.getElementById('var-main-img').value = ''; document.getElementById('var-color-input').value = ''; document.getElementById('var-extra-img-link').value = ''; fileInput.value = '';
    
    renderVarBuilderLists(); renderAdminVariants();
}

function removeVariant(index) { state.tempVariants.splice(index, 1); renderAdminVariants(); }

function renderAdminVariants() {
    const list = document.getElementById('admin-variants-list'); list.innerHTML = '';
    state.tempVariants.forEach((v, index) => {
        const safePrice = parseFloat(v.price) || 0;
        let desc = v.size; if(v.ram) desc += ' / ' + v.ram;
        let colorsText = v.colors && v.colors.length > 0 ? '| Cores: ' + v.colors.join(', ') : '';
        let imgsText = (v.mainImage || (v.extraImages && v.extraImages.length > 0)) ? '| 📷 Imagens inclusas' : '';
        list.innerHTML += '<li style="margin-bottom: 8px;">' + desc + ' - R$ ' + safePrice.toFixed(2) + ' <span style="color:#64748b; font-size:0.85rem; font-weight:normal;">' + colorsText + ' ' + imgsText + '</span>' +
            '<button onclick="app.removeVariant(' + index + ')" style="color: red; border: none; background: none; cursor: pointer; margin-left: 10px;">(X Excluir)</button></li>';
    });
}

async function saveProduct() {
    const id = document.getElementById('edit-prod-id').value;
    const name = document.getElementById('prod-name').value;
    const category = document.getElementById('prod-category').value;
    const specs = document.getElementById('prod-specs').value;
    const globalFileInput = document.getElementById('prod-img');
    const globalUrlInput = document.getElementById('prod-img-url').value;
    const globalExtraFilesInput = document.getElementById('prod-imgs-extra');
    
    if(!name) return customAlert("Atenção", "Preencha o Nome do produto!", "error");
    if(state.tempVariants.length === 0) return customAlert("Atenção", "Adicione ao menos uma variação.", "error");

    let finalImage = "";
    if(globalUrlInput) finalImage = globalUrlInput;
    else if (globalFileInput.files.length > 0) finalImage = await fileToBase64(globalFileInput.files[0]);
    else if(id) finalImage = state.products[id].image; 

    let extraImages = [];
    if (id && state.products[id].extraImages && globalExtraFilesInput.files.length === 0) extraImages = state.products[id].extraImages;
    else if (globalExtraFilesInput.files.length > 0) {
        for(let i = 0; i < globalExtraFilesInput.files.length; i++) extraImages.push(await fileToBase64(globalExtraFilesInput.files[i]));
    }
    
    const prodData = { name, category, specs, image: finalImage, extraImages, variants: state.tempVariants };

    if(id) { await update(ref(db, dbPath('estoque/' + id)), prodData); customAlert("Pronto!", "Produto atualizado.", "success"); } 
    else { await set(push(ref(db, dbPath('estoque'))), prodData); customAlert("Pronto!", "Produto cadastrado.", "success"); }
    cancelEdit(); 
}

function editProduct(id) {
    const p = state.products[id]; if(!p) return;
    document.getElementById('form-product-title').innerText = "Editar Produto";
    document.getElementById('edit-prod-id').value = id; document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-category').value = p.category; document.getElementById('prod-specs').value = p.specs;
    document.getElementById('prod-img').value = ''; document.getElementById('prod-img-url').value = ''; document.getElementById('prod-imgs-extra').value = '';

    if(p.variants) {
        state.tempVariants = p.variants.map(v => ({ size: v.size, ram: v.ram, price: parseFloat(v.price), colors: v.colors || [], mainImage: v.mainImage || '', extraImages: v.extraImages || [] }));
    } else state.tempVariants = [{ size: "Padrão", price: parseFloat(p.price) || 0 }];
    
    renderAdminVariants();
    document.getElementById('btn-save-prod').innerText = "Atualizar Produto (Finalizar Edição)";
    document.getElementById('btn-cancel-edit').style.display = "block";
    window.scrollTo(0, 0);
}

function cancelEdit() {
    document.getElementById('form-product-title').innerText = "Cadastrar Novo Produto";
    document.getElementById('edit-prod-id').value = ''; document.getElementById('prod-name').value = '';
    document.getElementById('prod-category').value = ''; document.getElementById('prod-specs').value = '';
    document.getElementById('prod-img').value = ''; document.getElementById('prod-img-url').value = ''; document.getElementById('prod-imgs-extra').value = '';
    
    state.tempVariants = []; state.currentVarBuilder = { colors: [], extraLinks: [] };
    renderAdminVariants(); renderVarBuilderLists();

    document.getElementById('btn-save-prod').innerText = "Finalizar Cadastro do Produto";
    document.getElementById('btn-cancel-edit').style.display = "none";
}

function deleteProduct(id) { if(confirm("Excluir este produto e todas suas variações?")) remove(ref(db, dbPath('estoque/' + id))); }

function loadAdminProducts() {
    const tbody = document.getElementById('admin-products-list'); tbody.innerHTML = '';
    Object.keys(state.products).forEach(id => {
        const p = state.products[id];
        let priceText = ""; let displayImg = p.image;

        if(p.variants && p.variants.length > 0) {
            priceText = 'R$ ' + parseFloat(p.variants[0].price).toFixed(2) + ' <small>(+' + (p.variants.length-1) + ' var.)</small>';
            if (p.variants[0].mainImage) displayImg = p.variants[0].mainImage;
        } else { priceText = 'R$ ' + parseFloat(p.price || 0).toFixed(2); }

        tbody.innerHTML += `
            <tr>
                <td><img src="${displayImg}"></td>
                <td>${p.name}<br><small>${p.category}</small></td>
                <td>${priceText}</td>
                <td class="action-btns">
                    <button onclick="app.editProduct('${id}')" class="btn-warning" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="app.deleteProduct('${id}')" class="btn-danger" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================
if (isRootUrl) {
    document.getElementById('main-navbar').style.display = 'none';
    document.getElementById('app-container').style.padding = '0';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-global-login').classList.add('active');
} else {
    onValue(ref(db, dbPath('config')), (snapshot) => {
        if(snapshot.exists()) {
            const cfg = snapshot.val();
            if(cfg.storeName) {
                document.querySelectorAll('.store-name-display').forEach(el => el.innerText = cfg.storeName);
                document.title = cfg.storeName;
                if(document.getElementById('admin-store-name')) document.getElementById('admin-store-name').value = cfg.storeName;
            }
            if(cfg.themeColor) {
                document.documentElement.style.setProperty('--primary', cfg.themeColor);
                if(document.getElementById('admin-theme-color')) document.getElementById('admin-theme-color').value = cfg.themeColor;
            }
            if(cfg.pixKey && document.getElementById('admin-pix-key')) document.getElementById('admin-pix-key').value = cfg.pixKey;
        }
    });

    onValue(ref(db, dbPath('estoque')), (snapshot) => {
        state.products = snapshot.val() || {};
        renderCategoryButtons(); filterProducts();
        if(state.isAdminLoggedIn) loadAdminProducts();
    });

    onValue(ref(db, dbPath('vendas')), (snapshot) => {
        state.allOrders = snapshot.val() || {};
        if(state.isAdminLoggedIn) { loadAdminOrders(); filterDashboard(); }
    });

    const savedAppView = localStorage.getItem('lastAppView_' + CURRENT_STORE);
    
    if(state.isAdminLoggedIn) {
        if(!savedAppView || savedAppView === 'admin-panel') {
            const savedTab = localStorage.getItem('lastAdminTab_' + CURRENT_STORE) || 'dash';
            showView('admin-panel');
            showAdminTab(savedTab);
            if(state.adminRole === 'superadmin') loadSystemUsers();
        } else { showView(savedAppView); }
    } else {
        if(!savedAppView || savedAppView === 'admin-panel' || savedAppView === 'admin-login') showView('catalog'); 
        else showView(savedAppView);
    }
}

window.app = {
    showView, toggleClientAuthMode, registerClient, loginClient, loadClientOrders, clientConfirmReceipt,
    addToCartSelected, removeFromCart, startCheckout, finishCheckout, filterProducts, changeProductPrice,
    loginAdmin, logoutAdmin, showAdminTab, saveProduct, editProduct, cancelEdit, deleteProduct, approveOrder, completeOrder, openReceipt, saveStoreConfig, filterDashboard,
    openGallery, closeGallery, prevImage, nextImage, addVariant, removeVariant,
    addVarColor, removeVarColor, addVarExtraLink, removeVarExtraLink, copyPixPayload,
    saveTenantStore, editTenantStore, cancelEditTenant, deleteTenantStore, importProductsJSON, processGlobalLogin
};