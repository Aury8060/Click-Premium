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

const state = {
    cart: [],
    currentUser: JSON.parse(localStorage.getItem('cellCatalogUser')) || null,
    isAdminLoggedIn: localStorage.getItem('cellCatalogAdmin') === 'true',
    products: {}, 
    currentCategory: 'Todos',
    gallery: { images: [], index: 0 },
    tempVariants: [],
    currentVarBuilder: { colors: [], extraLinks: [] }
};

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewElement = document.getElementById(`view-${viewId}`);
    if (viewElement) viewElement.classList.add('active');
    
    if(viewId === 'catalog') filterProducts(); 
    if(viewId === 'cart') renderCart();
    updateNavbar();
}

function updateNavbar() {
    document.getElementById('cart-count').innerText = state.cart.length;
    const userBtn = document.getElementById('nav-user-btn');
    const adminBtn = document.getElementById('nav-admin-btn');
    const adminLogoutBtn = document.getElementById('nav-admin-logout');

    if (state.currentUser) {
        userBtn.innerHTML = `<i class="fas fa-user-check"></i> ${state.currentUser.name.split(' ')[0]}`;
        userBtn.onclick = () => showView('cart');
    } else {
        userBtn.innerHTML = `<i class="fas fa-user"></i> Entrar`;
        userBtn.onclick = () => showView('login');
    }

    if (state.isAdminLoggedIn) {
        adminBtn.style.color = "var(--primary)";
        adminLogoutBtn.style.display = "inline-block";
        if(document.querySelector('.view.active') && document.querySelector('.view.active').id === 'view-admin-login') {
            showView('admin-panel');
            loadAdminProducts();
            loadAdminOrders();
        }
    } else {
        adminBtn.style.color = "#94a3b8";
        adminLogoutBtn.style.display = "none";
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
// CATÁLOGO E FILTROS
// ==========================================
onValue(ref(db, 'estoque'), (snapshot) => {
    state.products = snapshot.val() || {};
    renderCategoryButtons();
    filterProducts();
    if(state.isAdminLoggedIn) loadAdminProducts();
});

function renderCategoryButtons() {
    const categories = new Set(['Todos']);
    Object.values(state.products).forEach(p => {
        if(p.category) categories.add(p.category.toUpperCase());
    });

    const filterContainer = document.getElementById('category-filters');
    filterContainer.innerHTML = '';
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `cat-btn ${state.currentCategory === cat ? 'active' : ''}`;
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
        grid.innerHTML = '<p>Nenhum produto encontrado com estes filtros.</p>';
        return;
    }

    filtered.forEach(([id, p]) => {
        const imgAction = `onclick="app.openGallery('${id}')" title="Ver fotos"`;

        let optionsHtml = '';
        let colorHtml = '';
        let displayPrice = parseFloat(p.price) || 0;
        let displayImg = p.image;

        if (p.variants && p.variants.length > 0) {
            const firstVar = p.variants[0];
            displayPrice = parseFloat(firstVar.price) || 0;
            if (firstVar.mainImage) displayImg = firstVar.mainImage;

            optionsHtml = `
                <select id="select-var-${id}" class="variant-select" onchange="app.changeProductPrice('${id}', this.value)" style="margin-bottom: 5px;">
                    ${p.variants.map((v, i) => {
                        let label = v.size || 'Padrão';
                        if(v.ram) label += ` / ${v.ram}`;
                        return `<option value="${i}">${label}</option>`;
                    }).join('')}
                </select>
            `;

            if (firstVar.colors && firstVar.colors.length > 0) {
                colorHtml = `
                    <select id="select-color-${id}" class="variant-select color-select">
                        ${firstVar.colors.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                `;
            } else {
                colorHtml = `<select id="select-color-${id}" class="variant-select color-select" style="display:none;"><option value="">Padrão</option></select>`;
            }
        } else {
            optionsHtml = `<input type="hidden" id="select-var-${id}" value="-1">`;
            colorHtml = `<input type="hidden" id="select-color-${id}" value="">`;
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
                    <button class="btn-primary" onclick="app.addToCartSelected('${id}')">
                        Adicionar ao Carrinho
                    </button>
                </div>
            </div>
        `;
    });
}

function changeProductPrice(id, variantIndex) {
    const p = state.products[id];
    if(!p || !p.variants || variantIndex === "-1") return;
    
    const v = p.variants[variantIndex];
    const price = parseFloat(v.price) || 0;
    
    document.getElementById(`price-display-${id}`).innerText = `R$ ${price.toFixed(2)}`;

    const imgEl = document.getElementById(`img-display-${id}`);
    if(imgEl) imgEl.src = v.mainImage ? v.mainImage : p.image;

    const colorSelect = document.getElementById(`select-color-${id}`);
    if(colorSelect) {
        if(v.colors && v.colors.length > 0) {
            colorSelect.innerHTML = v.colors.map(c => `<option value="${c}">${c}</option>`).join('');
            colorSelect.style.display = 'block';
        } else {
            colorSelect.innerHTML = `<option value="">Padrão</option>`;
            colorSelect.style.display = 'none';
        }
    }
}

function addToCartSelected(id) {
    const p = state.products[id];
    const selectVar = document.getElementById(`select-var-${id}`);
    const selectColor = document.getElementById(`select-color-${id}`);
    
    let finalName = p.name;
    let finalPrice = parseFloat(p.price) || 0;
    let selectedColor = selectColor && selectColor.style.display !== 'none' ? selectColor.value : '';

    if (p.variants && p.variants.length > 0) {
        const vIndex = selectVar.value;
        const v = p.variants[vIndex];
        
        let varDesc = v.size || 'Padrão';
        if(v.ram) varDesc += ` / ${v.ram}`;
        if(selectedColor) varDesc += ` - Cor: ${selectedColor}`;
        
        finalName = `${p.name} (${varDesc})`;
        finalPrice = parseFloat(v.price) || 0;
    } else if (selectedColor) {
        finalName = `${p.name} (Cor: ${selectedColor})`;
    }

    state.cart.push({ id, name: finalName, price: finalPrice });
    alert(`${finalName} adicionado ao carrinho!`);
    updateNavbar();
}

// ==========================================
// GALERIA E AUTENTICAÇÃO
// ==========================================
function openGallery(id) {
    const p = state.products[id];
    if(!p) return;
    let images = [];
    const selectVar = document.getElementById(`select-var-${id}`);

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
        state.gallery.images = images;
        state.gallery.index = 0;
        updateGalleryUI();
        document.getElementById('gallery-modal').style.display = 'flex';
    }
}

function updateGalleryUI() {
    document.getElementById('gallery-img').src = state.gallery.images[state.gallery.index];
    document.getElementById('gallery-counter').innerText = `${state.gallery.index + 1} / ${state.gallery.images.length}`;
}
function prevImage() {
    if(state.gallery.index > 0) state.gallery.index--;
    else state.gallery.index = state.gallery.images.length - 1;
    updateGalleryUI();
}
function nextImage() {
    if(state.gallery.index < state.gallery.images.length - 1) state.gallery.index++;
    else state.gallery.index = 0;
    updateGalleryUI();
}
function closeGallery() { document.getElementById('gallery-modal').style.display = 'none'; }

function toggleClientAuthMode() {
    const loginForm = document.getElementById('client-login-form');
    const regForm = document.getElementById('client-register-form');
    if(loginForm.style.display === 'none') {
        loginForm.style.display = 'block'; regForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none'; regForm.style.display = 'block';
    }
}

async function registerClient() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value;
    const address = document.getElementById('reg-address').value;
    const password = document.getElementById('reg-pass').value;

    if(!name || !email || !password || !phone) return alert("Preencha os campos obrigatórios!");

    const clientId = sanitizeEmail(email);
    const clientData = { name, email, phone, address, password };

    await set(ref(db, `clientes/${clientId}`), clientData);
    state.currentUser = clientData;
    localStorage.setItem('cellCatalogUser', JSON.stringify(clientData));
    alert("Cadastro realizado com sucesso!");
    showView('cart');
}

async function loginClient() {
    const email = document.getElementById('cli-email').value;
    const pass = document.getElementById('cli-pass').value;
    const snapshot = await get(ref(db, `clientes/${sanitizeEmail(email)}`));
    
    if (snapshot.exists() && snapshot.val().password === pass) {
        state.currentUser = snapshot.val();
        localStorage.setItem('cellCatalogUser', JSON.stringify(snapshot.val()));
        showView('cart');
    } else {
        alert("Email ou Senha incorretos!");
    }
}

// ==========================================
// LÓGICA DO PIX (QR CODE E PAYLOAD)
// ==========================================
function renderCart() {
    const list = document.getElementById('cart-items');
    list.innerHTML = '';
    let total = 0;
    
    if(state.cart.length === 0) {
        list.innerHTML = '<p>Seu carrinho está vazio.</p>';
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
                        <button onclick="app.removeFromCart(${index})" style="margin-left: 10px; color: red; border: none; background: none; cursor: pointer;">X</button>
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
    renderCart();
    updateNavbar();
}

// Calculo do CRC16 necessário para PIX válido
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

// Montador da string Payload PIX
function generatePixPayload(pixKey, amount) {
    const f = (id, val) => {
        const str = String(val);
        return `${id}${str.length.toString().padStart(2, '0')}${str}`;
    };
    
    let p = "000201";
    p += f("26", f("00", "br.gov.bcb.pix") + f("01", pixKey)); // Chave PIX
    p += f("52", "0000"); // Categoria Comercial
    p += f("53", "0986"); // Moeda BRL
    p += f("54", amount.toFixed(2)); // Valor
    p += f("58", "BR"); // Pais
    p += f("59", "Click Premium"); // Nome do Recebedor
    p += f("60", "Cidade"); // Cidade
    p += f("62", f("05", "***")); // ID Transação
    p += "6304"; // Prefixo CRC
    p += crc16(p); // Valor CRC Calculado
    
    return p;
}

async function startCheckout() {
    if(!state.currentUser) {
        alert("Você precisa fazer login ou se cadastrar para comprar!");
        return showView('login');
    }
    if(state.cart.length === 0) return alert("Carrinho Vazio.");
    
    // Busca a Chave PIX cadastrada pelo admin
    const snap = await get(ref(db, 'config/pixKey'));
    let pixKey = snap.exists() ? snap.val() : "";
    
    if(!pixKey) {
        alert("Erro: O lojista ainda não configurou uma chave PIX.");
        return;
    }

    // Calcula valor total e gera o Payload (Copia e Cola)
    const total = state.cart.reduce((acc, item) => acc + parseFloat(item.price), 0);
    const pixPayload = generatePixPayload(pixKey, total);
    
    // Atualiza a Tela
    document.getElementById('pix-total-display').innerText = total.toFixed(2);
    document.getElementById('pix-payload-input').value = pixPayload;
    
    // Usa uma API gratuita do Google/QR Server para converter o código do PIX em imagem
    document.getElementById('pix-qrcode').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixPayload)}`;
    
    document.getElementById('checkout-step').style.display = 'block';
    document.getElementById('btn-start-checkout').style.display = 'none';
}

function copyPixPayload() {
    const input = document.getElementById('pix-payload-input');
    input.select();
    input.setSelectionRange(0, 99999); // Para mobile
    navigator.clipboard.writeText(input.value).then(() => {
        alert("Código PIX copiado! Cole no aplicativo do seu banco.");
    }).catch(() => {
        alert("Erro ao copiar. Selecione o código manualmente.");
    });
}

async function finishCheckout() {
    const fileInput = document.getElementById('receipt-file');
    if(fileInput.files.length === 0) return alert("Por favor, anexe o comprovante do PIX.");

    const base64Receipt = await fileToBase64(fileInput.files[0]);
    const total = state.cart.reduce((acc, item) => acc + parseFloat(item.price), 0);
    
    const orderData = {
        client: state.currentUser,
        items: state.cart,
        total: total,
        receipt: base64Receipt,
        status: "Aguardando Validação",
        date: new Date().toLocaleString()
    };

    await set(push(ref(db, 'vendas')), orderData);
    alert("Pedido enviado! O administrador irá validar seu PIX.");
    state.cart = [];
    renderCart();
    showView('catalog');
}

// ==========================================
// ÁREA DO ADMINISTRADOR
// ==========================================
function loginAdmin() {
    const u = document.getElementById('admin-user').value;
    const p = document.getElementById('admin-pass').value;
    if(u === 'au.costa' && p === '80605276') {
        state.isAdminLoggedIn = true;
        localStorage.setItem('cellCatalogAdmin', 'true');
        updateNavbar();
        showView('admin-panel');
        loadAdminProducts();
        loadAdminOrders();
        get(ref(db, 'config/pixKey')).then(snap => {
            if(snap.exists()) document.getElementById('admin-pix-key').value = snap.val();
        });
    } else { alert("Acesso negado."); }
}

function logoutAdmin() {
    state.isAdminLoggedIn = false;
    localStorage.removeItem('cellCatalogAdmin');
    updateNavbar();
    showView('catalog');
}

function showAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
    const targetTab = document.getElementById(`admin-tab-${tab}`);
    if(targetTab) targetTab.style.display = 'block';
    else document.getElementById(`admin-tab-products`).style.display = 'block';
}

function addVarColor() {
    const color = document.getElementById('var-color-input').value.trim();
    if(!color) return;
    state.currentVarBuilder.colors.push(color);
    document.getElementById('var-color-input').value = '';
    renderVarBuilderLists();
}

function removeVarColor(index) {
    state.currentVarBuilder.colors.splice(index, 1);
    renderVarBuilderLists();
}

function addVarExtraLink() {
    const link = document.getElementById('var-extra-img-link').value.trim();
    if(!link) return;
    state.currentVarBuilder.extraLinks.push(link);
    document.getElementById('var-extra-img-link').value = '';
    renderVarBuilderLists();
}

function removeVarExtraLink(index) {
    state.currentVarBuilder.extraLinks.splice(index, 1);
    renderVarBuilderLists();
}

function renderVarBuilderLists() {
    const colorContainer = document.getElementById('var-colors-list');
    colorContainer.innerHTML = state.currentVarBuilder.colors.map((c, i) =>
        `<span class="badge badge-color">${c} <i class="fas fa-times" onclick="app.removeVarColor(${i})" style="cursor:pointer; margin-left:3px;"></i></span>`
    ).join('');

    const linkContainer = document.getElementById('var-links-list');
    linkContainer.innerHTML = state.currentVarBuilder.extraLinks.map((l, i) =>
        `<span class="badge badge-link">Link Adicionado <i class="fas fa-times" onclick="app.removeVarExtraLink(${i})" style="cursor:pointer; margin-left:3px;"></i></span>`
    ).join('');
}

async function addVariant() {
    const storage = document.getElementById('var-storage').value.trim();
    const ram = document.getElementById('var-ram').value.trim();
    const price = parseFloat(document.getElementById('var-price').value);
    const mainImg = document.getElementById('var-main-img').value.trim();

    if(!storage || isNaN(price)) return alert("Armazenamento e Preço são obrigatórios para salvar a variação!");

    let extraImages = [...state.currentVarBuilder.extraLinks];
    const fileInput = document.getElementById('var-extra-img-file');
    
    if(fileInput.files.length > 0) {
        for(let i=0; i < fileInput.files.length; i++) {
            const b64 = await fileToBase64(fileInput.files[i]);
            extraImages.push(b64);
        }
    }

    state.tempVariants.push({
        size: storage,
        ram: ram,
        price: price,
        colors: [...state.currentVarBuilder.colors],
        mainImage: mainImg,
        extraImages: extraImages
    });

    state.currentVarBuilder = { colors: [], extraLinks: [] };
    document.getElementById('var-storage').value = '';
    document.getElementById('var-ram').value = '';
    document.getElementById('var-price').value = '';
    document.getElementById('var-main-img').value = '';
    document.getElementById('var-color-input').value = '';
    document.getElementById('var-extra-img-link').value = '';
    fileInput.value = '';

    renderVarBuilderLists();
    renderAdminVariants();
}

function removeVariant(index) {
    state.tempVariants.splice(index, 1);
    renderAdminVariants();
}

function renderAdminVariants() {
    const list = document.getElementById('admin-variants-list');
    list.innerHTML = '';
    state.tempVariants.forEach((v, index) => {
        const safePrice = parseFloat(v.price) || 0;
        let desc = v.size;
        if(v.ram) desc += ` / ${v.ram}`;
        let colorsText = v.colors && v.colors.length > 0 ? `| Cores: ${v.colors.join(', ')}` : '';
        let imgsText = (v.mainImage || (v.extraImages && v.extraImages.length > 0)) ? `| 📷 Imagens inclusas` : '';

        list.innerHTML += `
            <li style="margin-bottom: 8px;">
                ${desc} - R$ ${safePrice.toFixed(2)} <span style="color:#64748b; font-size:0.85rem; font-weight:normal;">${colorsText} ${imgsText}</span>
                <button onclick="app.removeVariant(${index})" style="color: red; border: none; background: none; cursor: pointer; margin-left: 10px;">(X Excluir)</button>
            </li>`;
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

    if(!name) return alert("Preencha o Nome do produto!");
    if(state.tempVariants.length === 0) return alert("Adicione pelo menos UMA variação de armazenamento/preço na lista!");

    let finalImage = "";
    if(globalUrlInput) {
        finalImage = globalUrlInput;
    } else if (globalFileInput.files.length > 0) {
        finalImage = await fileToBase64(globalFileInput.files[0]);
    } else if(id) {
        finalImage = state.products[id].image; 
    }

    let extraImages = [];
    if (id && state.products[id].extraImages && globalExtraFilesInput.files.length === 0) {
        extraImages = state.products[id].extraImages;
    } else if (globalExtraFilesInput.files.length > 0) {
        for(let i = 0; i < globalExtraFilesInput.files.length; i++) {
            extraImages.push(await fileToBase64(globalExtraFilesInput.files[i]));
        }
    }

    const prodData = { name, category, specs, image: finalImage, extraImages, variants: state.tempVariants };

    if(id) {
        await update(ref(db, `estoque/${id}`), prodData);
        alert("Produto atualizado!");
    } else {
        await set(push(ref(db, 'estoque')), prodData);
        alert("Produto cadastrado!");
    }
    
    cancelEdit(); 
}

function editProduct(id) {
    const p = state.products[id];
    if(!p) return;
    
    document.getElementById('form-product-title').innerText = "Editar Produto";
    document.getElementById('edit-prod-id').value = id;
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-category').value = p.category;
    document.getElementById('prod-specs').value = p.specs;
    
    document.getElementById('prod-img').value = '';
    document.getElementById('prod-img-url').value = '';
    document.getElementById('prod-imgs-extra').value = '';

    if(p.variants) {
        state.tempVariants = p.variants.map(v => ({
            size: v.size, ram: v.ram, price: parseFloat(v.price), 
            colors: v.colors || [], mainImage: v.mainImage || '', extraImages: v.extraImages || []
        }));
    } else {
        state.tempVariants = [{ size: "Padrão", price: parseFloat(p.price) || 0 }];
    }
    
    renderAdminVariants();

    document.getElementById('btn-save-prod').innerText = "Atualizar Produto (Finalizar Edição)";
    document.getElementById('btn-cancel-edit').style.display = "block";
    window.scrollTo(0, 0);
}

function cancelEdit() {
    document.getElementById('form-product-title').innerText = "Cadastrar Novo Produto";
    document.getElementById('edit-prod-id').value = '';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-category').value = '';
    document.getElementById('prod-specs').value = '';
    document.getElementById('prod-img').value = '';
    document.getElementById('prod-img-url').value = '';
    document.getElementById('prod-imgs-extra').value = '';
    
    state.tempVariants = [];
    state.currentVarBuilder = { colors: [], extraLinks: [] };
    renderAdminVariants();
    renderVarBuilderLists();

    document.getElementById('btn-save-prod').innerText = "Finalizar Cadastro do Produto";
    document.getElementById('btn-cancel-edit').style.display = "none";
}

function deleteProduct(id) {
    if(confirm("Excluir este produto e todas suas variações?")) remove(ref(db, `estoque/${id}`));
}

function loadAdminProducts() {
    const tbody = document.getElementById('admin-products-list');
    tbody.innerHTML = '';
    Object.keys(state.products).forEach(id => {
        const p = state.products[id];
        let priceText = "";
        let displayImg = p.image;

        if(p.variants && p.variants.length > 0) {
            priceText = `R$ ${parseFloat(p.variants[0].price).toFixed(2)} <small>(+${p.variants.length-1} var.)</small>`;
            if (p.variants[0].mainImage) displayImg = p.variants[0].mainImage;
        } else {
            priceText = `R$ ${parseFloat(p.price || 0).toFixed(2)}`;
        }

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

function loadAdminOrders() {
    onValue(ref(db, 'vendas'), (snapshot) => {
        const tbody = document.getElementById('admin-orders-list');
        tbody.innerHTML = '';
        const data = snapshot.val();
        if(data) {
            Object.keys(data).reverse().forEach(id => {
                const o = data[id];
                const itemsList = o.items.map(i => i.name).join(', ');
                tbody.innerHTML += `
                    <tr>
                        <td><small>${id}</small><br><strong>${o.date}</strong></td>
                        <td>${o.client.name}<br><small>${o.client.phone}</small></td>
                        <td>R$ ${o.total.toFixed(2)}<br><small>${itemsList}</small></td>
                        <td><b>${o.status}</b></td>
                        <td><a href="${o.receipt}" download="comprovante_${o.client.name}">Ver Comprovante</a></td>
                        <td>
                            <button onclick="app.approveOrder('${id}')" class="btn-success">Aprovar / Despachar</button>
                        </td>
                    </tr>
                `;
            });
        }
    });
}

function approveOrder(id) { update(ref(db, `vendas/${id}`), { status: "Pagamento Aprovado - Em Despacho" }); }
function savePixKey() {
    const key = document.getElementById('admin-pix-key').value;
    set(ref(db, 'config/pixKey'), key);
    alert("Chave PIX atualizada com sucesso!");
}

updateNavbar();
if(!state.isAdminLoggedIn) showView('catalog');
else updateNavbar(); 

window.app = {
    showView, toggleClientAuthMode, registerClient, loginClient,
    addToCartSelected, removeFromCart, startCheckout, finishCheckout, filterProducts, changeProductPrice,
    loginAdmin, logoutAdmin, showAdminTab, saveProduct, editProduct, cancelEdit, deleteProduct, approveOrder, savePixKey,
    openGallery, closeGallery, prevImage, nextImage, addVariant, removeVariant,
    addVarColor, removeVarColor, addVarExtraLink, removeVarExtraLink, copyPixPayload
};