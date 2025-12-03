/**
 * Meme Coin Tracker Logic
 */

// State
let tokens = [];
const MAX_TOKENS = 100;
const UPDATE_INTERVAL = 5000; // Update prices every 5 seconds
const NEW_TOKEN_INTERVAL = 8000; // Simulate new token every 8 seconds

// DOM Elements
const gridContainer = document.getElementById('grid-container');
const tokenCountSpan = document.getElementById('token-count');
const connectionStatus = document.getElementById('connection-status');

// Mock Data for Telegram Simulation
const MOCK_NAMES = ['PEPE', 'DOGE', 'SHIB', 'BONK', 'WIF', 'FLOKI', 'MEME', 'TURBO', 'LADYS', 'WOJAK'];
const MOCK_CHANNELS = ['Meme Calls 🚀', 'Degen Plays 💎', 'Solana Gems ☀️', 'Whale Alerts 🐋', 'Alpha Hunters 🕵️'];
const MOCK_CAS = [
    '0x6982508145454Ce325dDbE47a25d4ec3d2311933', // PEPE
    '0xba2aE424d960c26247Dd6c32edC70B295c759791', // TURBO
    '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', // SHIB
    '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', // MATIC (Just for test)
];

/**
 * Generates a random mock token
 */
function generateMockToken() {
    const name = MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)] + Math.floor(Math.random() * 1000);
    const ca = '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    const useReal = Math.random() > 0.7;
    const finalCa = useReal ? MOCK_CAS[Math.floor(Math.random() * MOCK_CAS.length)] : ca;
    const channel = MOCK_CHANNELS[Math.floor(Math.random() * MOCK_CHANNELS.length)];

    return {
        id: Date.now().toString(),
        name: name,
        ca: finalCa,
        channel: channel,
        price: 0,
        change24h: 0,
        mentions: Math.floor(Math.random() * 50) + 1,
        history: [] // For chart
    };
}

/**
 * Generates simulated history data based on current change
 */
function generateHistoryData(change24h, points = 20) {
    const data = [];
    let current = 100; // Start base
    const trend = parseFloat(change24h) / points;

    for (let i = 0; i < points; i++) {
        // Add trend + random noise
        const noise = (Math.random() - 0.5) * 2;
        current += trend + noise;
        data.push(current);
    }
    return data;
}

/**
 * Fetches token data from DexScreener
 * @param {string} ca Contract Address
 */
async function fetchTokenData(ca) {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${ca}`);
        const data = await response.json();

        if (data.pairs && data.pairs.length > 0) {
            const pair = data.pairs[0];
            return {
                price: parseFloat(pair.priceUsd),
                change24h: pair.priceChange.h24,
                name: pair.baseToken.symbol
            };
        }
    } catch (error) {
        console.error('Error fetching data for', ca, error);
    }
    return null;
}

/**
 * Adds a new token to the grid
 */
async function addNewToken() {
    const newToken = generateMockToken();

    // Fetch initial data
    const apiData = await fetchTokenData(newToken.ca);
    if (apiData) {
        newToken.price = apiData.price;
        newToken.change24h = apiData.change24h;
        newToken.name = apiData.name;
    } else {
        newToken.price = (Math.random() * 0.0001).toFixed(8);
        newToken.change24h = (Math.random() * 20 - 10).toFixed(2);
    }

    // Generate history for chart
    newToken.history = generateHistoryData(newToken.change24h);

    // Add to beginning of array
    tokens.unshift(newToken);

    // Limit to MAX_TOKENS
    if (tokens.length > MAX_TOKENS) {
        tokens.pop();
    }

    renderGrid();
}

/**
 * Updates prices for all visible tokens
 */
async function updatePrices() {
    const updates = tokens.map(async (token) => {
        const data = await fetchTokenData(token.ca);
        if (data) {
            token.price = data.price;
            token.change24h = data.change24h;
        } else {
            const change = (Math.random() - 0.5) * 0.000001;
            token.price = Math.max(0, parseFloat(token.price) + change);
            token.change24h = (parseFloat(token.change24h) + (Math.random() - 0.5)).toFixed(2);
        }
        // Update history slightly
        token.history.shift();
        const last = token.history[token.history.length - 1];
        const trend = parseFloat(token.change24h) / 20;
        token.history.push(last + trend + (Math.random() - 0.5));
    });

    await Promise.all(updates);
    renderGrid();
}

/**
 * Deletes a token by ID
 * @param {string} id 
 */
function deleteToken(id) {
    tokens = tokens.filter(t => t.id !== id);
    renderGrid();
}

/**
 * Renders a chart for a token
 */
function renderChart(canvasId, data, isPositive) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const color = isPositive ? '#4ade80' : '#f87171';

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(data.length).fill(''),
            datasets: [{
                data: data,
                borderColor: color,
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0,
                fill: true, // Fill the area under the curve
                backgroundColor: isPositive ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } },
            animation: false // Disable animation for performance
        }
    });
}

/**
 * Renders the grid
 */
/**
 * Renders the grid (Optimized for performance)
 */
function renderGrid() {
    tokenCountSpan.textContent = `Tokens: ${tokens.length}/${MAX_TOKENS}`;

    // 1. Remove tokens that are no longer in the list
    const currentIds = new Set(tokens.map(t => t.id));
    const existingCards = document.querySelectorAll('.token-card');
    existingCards.forEach(card => {
        if (!currentIds.has(card.dataset.id)) {
            card.remove();
        }
    });

    // 2. Add or Update tokens
    tokens.forEach((token, index) => {
        let card = document.querySelector(`.token-card[data-id="${token.id}"]`);
        const isPositive = parseFloat(token.change24h) >= 0;
        const changeClass = isPositive ? 'change-up' : 'change-down';
        const changeSign = isPositive ? '+' : '';

        // Create new card if it doesn't exist
        if (!card) {
            card = document.createElement('div');
            card.className = 'token-card';
            card.dataset.id = token.id;

            // Initial HTML structure
            card.innerHTML = `
                <div class="chart-container">
                    <canvas id="chart-${token.id}"></canvas>
                </div>
                <div class="card-content-wrapper">
                    <div class="card-header">
                        <div class="token-name" title="${token.name}">${token.name}</div>
                        <button class="delete-btn" title="Remove">×</button>
                    </div>
                    
                    <div class="community-stats">
                        <span class="stat-mentions">🔥 社区推广: ${token.mentions || 1}</span>
                        ${token.mcap ? `<span class="stat-mcap">💰 市值: ${token.mcap}</span>` : ''}
                        <span class="stat-time">⏱️ 首次推广: ${token.time_since_open || '暂无'}</span>
                    </div>

                    <div class="token-ca" title="Click to copy: ${token.ca}">
                        ${token.ca}
                    </div>
                    
                    <div class="token-metrics">
                        <div class="token-price">$${parseFloat(token.price).toFixed(8)}</div>
                        <div class="token-change ${changeClass}">${changeSign}${token.change24h}%</div>
                    </div>
                </div>
            `;

            // Event Listeners (Attached only once)

            // Delete Button
            card.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteToken(token.id);
            });

            // Copy CA
            card.querySelector('.token-ca').addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(token.ca);
                // Optional: Show feedback
                const el = e.currentTarget;
                const originalBg = el.style.background;
                el.style.background = '#4ade80'; // Green flash
                setTimeout(() => el.style.background = originalBg, 200);
            });

            // Expand/Collapse Logic
            card.addEventListener('click', (e) => {
                // Toggle expanded state
                if (card.classList.contains('expanded')) {
                    // Closing: Disable transition to prevent "flying" effect
                    card.style.transition = 'none';
                    card.classList.remove('expanded');
                    // Restore transition after a frame
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            card.style.transition = '';
                        }, 50);
                    });
                } else {
                    // Close others
                    document.querySelectorAll('.token-card.expanded').forEach(c => {
                        c.style.transition = 'none';
                        c.classList.remove('expanded');
                        requestAnimationFrame(() => {
                            setTimeout(() => {
                                c.style.transition = '';
                            }, 50);
                        });
                    });
                    // Expand this one (allow transition)
                    card.classList.add('expanded');
                }
            });

            // Insert at correct position (handling sort order if needed, but append/prepend logic in fetchLoop handles order)
            // Since we unshift to tokens array, new ones are at index 0.
            // But DOM order might be different if we just append.
            // Simplest: Prepend if new.
            if (gridContainer.firstChild) {
                gridContainer.insertBefore(card, gridContainer.firstChild);
            } else {
                gridContainer.appendChild(card);
            }

            // Render Chart once
            renderChart(`chart-${token.id}`, token.history, isPositive);

        } else {
            // Update existing card content (efficiently)
            card.querySelector('.token-name').textContent = token.name;
            card.querySelector('.token-name').title = token.name;

            card.querySelector('.token-price').textContent = `$${parseFloat(token.price).toFixed(8)}`;

            const changeEl = card.querySelector('.token-change');
            changeEl.className = `token-change ${changeClass}`;
            changeEl.textContent = `${changeSign}${token.change24h}%`;

            // Update stats if they change
            card.querySelector('.stat-mentions').textContent = `🔥 社区推广: ${token.mentions || 1}`;
            if (token.mcap) {
                const mcapEl = card.querySelector('.stat-mcap');
                if (mcapEl) mcapEl.textContent = `💰 市值: ${token.mcap}`;
            }

            // Note: We don't re-render the chart on every update to save performance, 
            // unless history actually changed significantly. 
            // For now, static chart is fine or we can update it if needed.
        }
    });
}

// Data Source Configuration
const DATA_SOURCE_URL = 'meme_data.json'; // Path to the backend-generated JSON file
let useRealData = false; // Will automatically switch to true if JSON is found

/**
 * Fetches tokens from the backend JSON file
 */
async function fetchBackendData() {
    try {
        // Add timestamp to prevent caching
        const response = await fetch(`${DATA_SOURCE_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error('No backend data found');
        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
            useRealData = true;
            connectionStatus.textContent = '● Live Feed (Backend)';
            connectionStatus.className = 'status-online';
            return data;
        }
    } catch (error) {
        // console.log('Backend data not available, using simulation.');
        useRealData = false;
        connectionStatus.textContent = '● Live Feed (Simulation)';
        connectionStatus.className = 'status-online'; // Still online, just sim
    }
    return null;
}

/**
 * Main loop to fetch new tokens
 */
async function fetchLoop() {
    // Try to get real data
    const realData = await fetchBackendData();

    if (realData) {
        // Merge real data
        // For simplicity in this demo, we'll just prepend new ones that aren't in our list
        // In a full app, we'd do a proper diff

        // Reverse to add oldest first if we are prepending, but usually JSON is sorted new->old
        // Let's assume JSON is Newest First.

        // We only want to add tokens we haven't seen.
        // A simple way is to check the ID of the newest token we have.

        const existingIds = new Set(tokens.map(t => t.id));

        // Process from oldest to newest in the batch to maintain order when unshifting? 
        // No, if JSON is [Newest, ..., Oldest], we should take the new ones.

        const newTokens = realData.filter(t => !existingIds.has(t.id));

        for (let i = newTokens.length - 1; i >= 0; i--) {
            const t = newTokens[i];
            // Initialize missing fields if backend doesn't provide them
            if (!t.price) t.price = 0;
            if (!t.change24h) t.change24h = 0;
            if (!t.mentions) t.mentions = 1;
            if (!t.history) t.history = generateHistoryData(t.change24h || 0);

            // Fetch real price immediately if CA is valid
            if (t.ca && t.ca.startsWith('0x') || t.ca.length > 30) {
                const apiData = await fetchTokenData(t.ca);
                if (apiData) {
                    t.price = apiData.price;
                    t.change24h = apiData.change24h;
                    t.name = apiData.name; // Use real symbol
                    // Regenerate history based on real change
                    t.history = generateHistoryData(t.change24h);
                }
            }

            tokens.unshift(t);
        }

        // Trim
        if (tokens.length > MAX_TOKENS) tokens.length = MAX_TOKENS;

        renderGrid();

    } else {
        // Fallback to Simulation
        addNewToken();
    }
}

// Initialize
function init() {
    // Initial population
    fetchLoop();

    // Set up polling
    setInterval(fetchLoop, NEW_TOKEN_INTERVAL); // Check for new tokens
    setInterval(updatePrices, UPDATE_INTERVAL); // Update prices of existing
}

window.deleteToken = deleteToken;
init();
