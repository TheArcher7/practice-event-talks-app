// Application State
let state = {
    entries: [],          // Raw entries from backend
    updates: [],          // Parsed individual updates
    selectedIds: new Set(), // Set of selected update IDs
    currentFilter: 'all',  // Active category filter
    searchQuery: '',      // Active search query
    lastSyncTime: null,   // Timestamp of last fetch
    activeTweetUpdate: null, // Update object in composer modal
    activeTweetTemplate: 'default', // Active tweet template ID
    customTweetText: ''   // Custom user-edited tweet content
};

// SVG Progress Ring Constants
const RING_RADIUS = 11;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ~69.115

// Badge configurations for categories
const CATEGORY_CONFIGS = {
    'Feature': { icon: 'sparkles', colorClass: 'badge-feature', label: 'Feature' },
    'Announcement': { icon: 'megaphone', colorClass: 'badge-announcement', label: 'Announcement' },
    'Breaking': { icon: 'alert-triangle', colorClass: 'badge-breaking', label: 'Breaking' },
    'Change': { icon: 'refresh-cw', colorClass: 'badge-change', label: 'Change' },
    'Issue': { icon: 'alert-octagon', colorClass: 'badge-issue', label: 'Issue' },
    'General': { icon: 'layers', colorClass: 'badge-general', label: 'General' }
};

// Tweet Templates
const TWEET_TEMPLATES = {
    default: {
        name: '⚡ Default',
        generate: (up, text) => {
            const header = `⚡ BigQuery ${up.type} (${up.date}):\n\n`;
            const footer = `\n\nDetails: ${up.link}`;
            const maxTextLen = 280 - header.length - footer.length;
            const body = text.length > maxTextLen ? text.substring(0, maxTextLen - 3) + '...' : text;
            return `${header}${body}${footer}`;
        }
    },
    hype: {
        name: '🚀 Hype',
        generate: (up, text) => {
            const header = `🚀 New BigQuery update! [${up.type}] (${up.date})\n\n💡 `;
            const footer = `\n\nRead more: ${up.link} #GoogleCloud #BigQuery`;
            const maxTextLen = 280 - header.length - footer.length;
            const body = text.length > maxTextLen ? text.substring(0, maxTextLen - 3) + '...' : text;
            return `${header}${body}${footer}`;
        }
    },
    minimal: {
        name: '✍️ Minimal',
        generate: (up, text) => {
            const footer = ` - details: ${up.link}`;
            const label = `[${up.type}] `;
            const maxTextLen = 280 - label.length - footer.length;
            const body = text.length > maxTextLen ? text.substring(0, maxTextLen - 3) + '...' : text;
            return `${label}${body}${footer}`;
        }
    }
};

// Initialize the Application
document.addEventListener('DOMContentLoaded', () => {
    initElements();
    setupEventListeners();
    fetchReleaseNotes();
});

// Cache DOM Elements
let el = {};
function initElements() {
    el.refreshBtn = document.getElementById('refreshBtn');
    el.retryBtn = document.getElementById('retryBtn');
    el.loadingState = document.getElementById('loadingState');
    el.errorState = document.getElementById('errorState');
    el.errorMessage = document.getElementById('errorMessage');
    el.feedView = document.getElementById('feedView');
    el.feedTimeline = document.getElementById('feedTimeline');
    el.searchInput = document.getElementById('searchInput');
    el.clearSearchBtn = document.getElementById('clearSearchBtn');
    el.syncStatusText = document.getElementById('syncStatusText');
    
    // Sidebar Stats & Filters
    el.statTotalVal = document.getElementById('stat-total-val');
    el.statFeaturesVal = document.getElementById('stat-features-val');
    el.statAnnouncementsVal = document.getElementById('stat-announcements-val');
    el.statBreakingVal = document.getElementById('stat-breaking-val');
    el.categoryFilters = document.getElementById('categoryFilters');
    
    // Selection Drawer
    el.selectionDrawer = document.getElementById('selectionDrawer');
    el.selectedCountText = document.getElementById('selectedCountText');
    el.btnTweetSelected = document.getElementById('btnTweetSelected');
    el.btnClearSelected = document.getElementById('btnClearSelected');
    
    // Tweet Modal Elements
    el.tweetModal = document.getElementById('tweetModal');
    el.closeTweetModal = document.getElementById('closeTweetModal');
    el.tweetContent = document.getElementById('tweetContent');
    el.btnCancelTweet = document.getElementById('btnCancelTweet');
    el.btnSendTweet = document.getElementById('btnSendTweet');
    el.charCountText = document.getElementById('charCountText');
    el.progressRingCircle = document.getElementById('progressRingCircle');
    el.toastContainer = document.getElementById('toastContainer');
    
    // Setup SVG Progress Ring
    if (el.progressRingCircle) {
        el.progressRingCircle.style.strokeDasharray = `${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;
        el.progressRingCircle.style.strokeDashoffset = RING_CIRCUMFERENCE;
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Refresh handlers
    el.refreshBtn.addEventListener('click', () => fetchReleaseNotes());
    el.retryBtn.addEventListener('click', () => fetchReleaseNotes());
    
    // Search input
    el.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        if (state.searchQuery) {
            el.clearSearchBtn.classList.remove('hidden');
        } else {
            el.clearSearchBtn.classList.add('hidden');
        }
        renderFeed();
    });
    
    el.clearSearchBtn.addEventListener('click', () => {
        el.searchInput.value = '';
        state.searchQuery = '';
        el.clearSearchBtn.classList.add('hidden');
        renderFeed();
    });
    
    // Category filter clicks
    el.categoryFilters.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            el.categoryFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentFilter = btn.dataset.category;
            renderFeed();
        });
    });
    
    // Selection buttons
    el.btnClearSelected.addEventListener('click', () => {
        state.selectedIds.clear();
        updateSelectionDrawer();
        renderFeed();
    });
    
    el.btnTweetSelected.addEventListener('click', () => {
        openTweetModalForSelection();
    });
    
    // Tweet Modal events
    el.closeTweetModal.addEventListener('click', closeTweetModal);
    el.btnCancelTweet.addEventListener('click', closeTweetModal);
    
    el.tweetContent.addEventListener('input', (e) => {
        state.customTweetText = e.target.value;
        updateTweetCharCount();
    });
    
    el.btnSendTweet.addEventListener('click', () => {
        const text = el.tweetContent.value;
        if (text.length > 280) {
            showToast('Tweet exceeds the 280-character limit!', 'error');
            return;
        }
        
        // Open Twitter Intent URL
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank', 'width=550,height=420');
        closeTweetModal();
        showToast('Opened Twitter / X composer!', 'success');
    });

    // Template Selector Cards
    document.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.activeTweetTemplate = card.dataset.templateId;
            
            // Regenerate composer text using the newly selected template
            if (state.activeTweetUpdate) {
                const generated = TWEET_TEMPLATES[state.activeTweetTemplate].generate(
                    state.activeTweetUpdate, 
                    state.activeTweetUpdate.text
                );
                el.tweetContent.value = generated;
                state.customTweetText = generated;
                updateTweetCharCount();
            }
        });
    });
}

// Fetch Release Notes from backend JSON API
function fetchReleaseNotes() {
    // Show loading spinner
    el.refreshBtn.classList.add('spinning');
    el.refreshBtn.disabled = true;
    
    el.loadingState.classList.remove('hidden');
    el.errorState.classList.add('hidden');
    el.feedView.classList.add('hidden');
    
    fetch('/api/releases')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.status === 'success') {
                state.entries = data.entries;
                state.updates = parseUpdates(data.entries);
                state.lastSyncTime = new Date();
                
                // Reset selections on fresh fetch
                state.selectedIds.clear();
                updateSelectionDrawer();
                
                // Update stats and display
                calculateStats();
                renderFeed();
                
                // Update header status
                const timeString = state.lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                el.syncStatusText.textContent = `Synced at ${timeString}`;
                showToast('Release notes successfully updated!', 'success');
                
                el.loadingState.classList.add('hidden');
                el.feedView.classList.remove('hidden');
            } else {
                throw new Error(data.message || 'Unknown server error');
            }
        })
        .catch(err => {
            console.error('Error fetching release notes:', err);
            el.errorMessage.textContent = err.message || 'Failed to connect to the server.';
            el.errorState.classList.remove('hidden');
            el.loadingState.classList.add('hidden');
            showToast('Failed to sync feed.', 'error');
        })
        .finally(() => {
            el.refreshBtn.classList.remove('spinning');
            el.refreshBtn.disabled = false;
        });
}

// Parse release feed HTML string to extract granular updates based on H3 tags
function parseUpdates(entries) {
    const allUpdates = [];
    
    entries.forEach(entry => {
        const contentHtml = entry.content;
        const parser = new DOMParser();
        const doc = parser.parseFromString(contentHtml, 'text/html');
        const nodes = Array.from(doc.body.childNodes);
        
        let currentUpdate = null;
        let updateIndex = 0;
        
        nodes.forEach(node => {
            // Check if node is an H3 element representing an update heading
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === 'h3') {
                if (currentUpdate) {
                    allUpdates.push(finalizeUpdate(currentUpdate, entry, updateIndex++));
                }
                currentUpdate = {
                    type: node.textContent.trim(),
                    elements: []
                };
            } else {
                if (!currentUpdate) {
                    // Fallback in case content starts directly without H3
                    currentUpdate = {
                        type: 'General',
                        elements: []
                    };
                }
                currentUpdate.elements.push(node.cloneNode(true));
            }
        });
        
        if (currentUpdate) {
            allUpdates.push(finalizeUpdate(currentUpdate, entry, updateIndex++));
        }
    });
    
    return allUpdates;
}

// Clean and compile elements of a sub-update into a structural object
function finalizeUpdate(updateObj, entry, index) {
    const tempDiv = document.createElement('div');
    updateObj.elements.forEach(el => tempDiv.appendChild(el));
    
    // Set anchor tags to open in new tab securely
    tempDiv.querySelectorAll('a').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
    });
    
    const htmlContent = tempDiv.innerHTML;
    
    // Create clean plain text for sharing / copying
    let textContent = tempDiv.textContent.trim();
    // Standardize spacing and carriage returns
    textContent = textContent.replace(/\n\s*\n/g, '\n\n').replace(/ {2,}/g, ' ');
    
    return {
        id: `${entry.id}_up_${index}`,
        type: updateObj.type,
        html: htmlContent,
        text: textContent,
        date: entry.title,
        link: entry.link,
        entryId: entry.id
    };
}

// Calculate and render sidebar statistics
function calculateStats() {
    const total = state.updates.length;
    const features = state.updates.filter(u => u.type === 'Feature').length;
    const announcements = state.updates.filter(u => u.type === 'Announcement').length;
    const breaking = state.updates.filter(u => u.type === 'Breaking').length;
    const changes = state.updates.filter(u => u.type === 'Change').length;
    const issues = state.updates.filter(u => u.type === 'Issue').length;
    
    // Set Sidebar numbers
    el.statTotalVal.textContent = total;
    el.statFeaturesVal.textContent = features;
    el.statAnnouncementsVal.textContent = announcements;
    el.statBreakingVal.textContent = breaking;
    
    // Set counts in category list
    document.getElementById('count-all').textContent = total;
    document.getElementById('count-feature').textContent = features;
    document.getElementById('count-announcement').textContent = announcements;
    document.getElementById('count-breaking').textContent = breaking;
    document.getElementById('count-change').textContent = changes;
    document.getElementById('count-issue').textContent = issues;
}

// Filter and render release timeline
function renderFeed() {
    el.feedTimeline.innerHTML = '';
    
    // 1. Apply Filters
    let filtered = state.updates;
    
    // Category Filter
    if (state.currentFilter !== 'all') {
        filtered = filtered.filter(u => u.type.toLowerCase() === state.currentFilter.toLowerCase());
    }
    
    // Keyword Search Filter
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        filtered = filtered.filter(u => 
            u.text.toLowerCase().includes(query) || 
            u.type.toLowerCase().includes(query) || 
            u.date.toLowerCase().includes(query)
        );
    }
    
    if (filtered.length === 0) {
        renderEmptyState();
        return;
    }
    
    // 2. Group updates by Date
    const groups = {};
    filtered.forEach(up => {
        if (!groups[up.date]) {
            groups[up.date] = [];
        }
        groups[up.date].push(up);
    });
    
    // 3. Render Groups in Timeline
    Object.keys(groups).forEach(date => {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'date-group';
        
        // Date Header
        const header = document.createElement('div');
        header.className = 'date-header';
        
        const node = document.createElement('div');
        node.className = 'date-node';
        node.innerHTML = '<i data-lucide="calendar" class="date-node-icon"></i>';
        
        const title = document.createElement('h3');
        title.className = 'date-title';
        title.textContent = date;
        
        header.appendChild(node);
        header.appendChild(title);
        dateGroup.appendChild(header);
        
        // Updates under this Date
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'date-updates';
        
        groups[date].forEach(up => {
            const card = createUpdateCard(up);
            cardsContainer.appendChild(card);
        });
        
        dateGroup.appendChild(cardsContainer);
        el.feedTimeline.appendChild(dateGroup);
    });
    
    // Reactivate icons parsed via Lucide
    lucide.createIcons();
}

// Render UI component for an update card
function createUpdateCard(up) {
    const card = document.createElement('div');
    card.className = `update-card ${state.selectedIds.has(up.id) ? 'selected' : ''}`;
    card.dataset.id = up.id;
    
    // Category styling
    const category = CATEGORY_CONFIGS[up.type] || CATEGORY_CONFIGS['General'];
    
    // Toggle card selection state on click (unless clicking on action buttons or links)
    card.addEventListener('click', (e) => {
        if (e.target.closest('.card-actions') || e.target.closest('a') || e.target.closest('.custom-checkbox')) {
            return;
        }
        toggleCardSelection(up.id);
    });
    
    // 1. Custom Selection Checkbox
    const chkContainer = document.createElement('div');
    chkContainer.className = 'card-checkbox-container';
    
    const chk = document.createElement('div');
    chk.className = 'custom-checkbox';
    chk.innerHTML = '<i data-lucide="check"></i>';
    chk.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCardSelection(up.id);
    });
    
    chkContainer.appendChild(chk);
    card.appendChild(chkContainer);
    
    // 2. Card Header (Badge)
    const header = document.createElement('div');
    header.className = 'card-header';
    
    const badge = document.createElement('span');
    badge.className = `badge ${category.colorClass}`;
    badge.innerHTML = `<i data-lucide="${category.icon}"></i> ${category.label}`;
    
    header.appendChild(badge);
    card.appendChild(header);
    
    // 3. Card Body (HTML description)
    const body = document.createElement('div');
    body.className = 'card-body';
    
    // If search is active, highlight matching words
    if (state.searchQuery) {
        body.innerHTML = highlightText(up.html, state.searchQuery);
    } else {
        body.innerHTML = up.html;
    }
    
    card.appendChild(body);
    
    // 4. Action Buttons (Tweet, Copy text, Copy link)
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    
    // Tweet Action Button
    const tweetBtn = document.createElement('button');
    tweetBtn.className = 'action-icon-btn btn-tweet';
    tweetBtn.title = 'Tweet about this update';
    tweetBtn.innerHTML = '<i data-lucide="twitter"></i>';
    tweetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTweetModal(up);
    });
    
    // Copy Text Button
    const copyTextBtn = document.createElement('button');
    copyTextBtn.className = 'action-icon-btn';
    copyTextBtn.title = 'Copy description text';
    copyTextBtn.innerHTML = '<i data-lucide="copy"></i>';
    copyTextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(`BigQuery ${up.type} (${up.date}): ${up.text}`)
            .then(() => showToast('Copied description to clipboard!', 'info'))
            .catch(() => showToast('Failed to copy text.', 'error'));
    });
    
    // Copy Link Button
    const copyLinkBtn = document.createElement('button');
    copyLinkBtn.className = 'action-icon-btn';
    copyLinkBtn.title = 'Copy release note URL';
    copyLinkBtn.innerHTML = '<i data-lucide="link"></i>';
    copyLinkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(up.link)
            .then(() => showToast('Copied link to clipboard!', 'info'))
            .catch(() => showToast('Failed to copy link.', 'error'));
    });
    
    actions.appendChild(tweetBtn);
    actions.appendChild(copyTextBtn);
    actions.appendChild(copyLinkBtn);
    card.appendChild(actions);
    
    return card;
}

// Toggle update card selection state
function toggleCardSelection(id) {
    if (state.selectedIds.has(id)) {
        state.selectedIds.delete(id);
    } else {
        state.selectedIds.add(id);
    }
    
    // Update visual card state immediately
    const cardEl = document.querySelector(`.update-card[data-id="${id}"]`);
    if (cardEl) {
        cardEl.classList.toggle('selected');
    }
    
    updateSelectionDrawer();
}

// Refresh bottom selection drawer status in sidebar
function updateSelectionDrawer() {
    const size = state.selectedIds.size;
    if (size > 0) {
        el.selectionDrawer.classList.remove('hidden');
        el.selectedCountText.textContent = size;
    } else {
        el.selectionDrawer.classList.add('hidden');
    }
}

// Open Composer Modal for a single update
function openTweetModal(up) {
    state.activeTweetUpdate = up;
    
    // Activate the default template selector card
    document.querySelectorAll('.template-card').forEach(c => {
        if (c.dataset.templateId === 'default') {
            c.classList.add('active');
        } else {
            c.classList.remove('active');
        }
    });
    state.activeTweetTemplate = 'default';
    
    // Build initial tweet text
    const text = TWEET_TEMPLATES.default.generate(up, up.text);
    el.tweetContent.value = text;
    state.customTweetText = text;
    
    // Open dialog
    el.tweetModal.classList.remove('hidden');
    updateTweetCharCount();
    
    // Hide template sections if using multi-tweet combo
    document.querySelector('.tweet-preview-section').classList.remove('hidden');
}

// Open Composer for combined selection (multi-tweet thread or compound post)
function openTweetModalForSelection() {
    if (state.selectedIds.size === 0) return;
    
    const selectedUpdates = state.updates.filter(u => state.selectedIds.has(u.id));
    
    // Build a combined summary update object
    let compositeText = '';
    selectedUpdates.forEach((up, index) => {
        // Truncate individual items so they fit together
        let shortText = up.text;
        if (shortText.length > 60) {
            shortText = shortText.substring(0, 57) + '...';
        }
        compositeText += `• [${up.type}] ${shortText}\n`;
    });
    
    // Create compound update object
    const compositeUpdate = {
        type: 'Releases',
        date: 'Recent',
        text: compositeText.trim(),
        link: selectedUpdates[0].link // Link to first item
    };
    
    state.activeTweetUpdate = compositeUpdate;
    
    // Set custom text directly
    const text = `BigQuery Updates:\n\n${compositeUpdate.text}\n\nDetails: ${compositeUpdate.link}`;
    el.tweetContent.value = text;
    state.customTweetText = text;
    
    el.tweetModal.classList.remove('hidden');
    updateTweetCharCount();
    
    // Hide template cards as they are meant for single items
    document.querySelector('.tweet-preview-section').classList.add('hidden');
}

// Close Tweet Composer Dialog
function closeTweetModal() {
    el.tweetModal.classList.add('hidden');
    state.activeTweetUpdate = null;
    state.customTweetText = '';
}

// Update character limits and progress SVGs inside the modal
function updateTweetCharCount() {
    const len = state.customTweetText.length;
    const remaining = 280 - len;
    
    el.charCountText.textContent = remaining;
    
    // Styles matching thresholds
    if (remaining < 0) {
        el.charCountText.className = 'char-count-text danger';
        el.progressRingCircle.style.stroke = 'var(--color-rose)';
        el.btnSendTweet.disabled = true;
        el.btnSendTweet.style.opacity = '0.5';
    } else if (remaining <= 20) {
        el.charCountText.className = 'char-count-text warning';
        el.progressRingCircle.style.stroke = 'var(--color-amber)';
        el.btnSendTweet.disabled = false;
        el.btnSendTweet.style.opacity = '1';
    } else {
        el.charCountText.className = 'char-count-text';
        el.progressRingCircle.style.stroke = 'var(--color-twitter)';
        el.btnSendTweet.disabled = false;
        el.btnSendTweet.style.opacity = '1';
    }
    
    // Calculate SVG Stroke Offset
    const ratio = Math.min(len / 280, 1);
    const strokeOffset = RING_CIRCUMFERENCE * (1 - ratio);
    el.progressRingCircle.style.strokeDashoffset = strokeOffset;
}

// High-fidelity search highlighting inside HTML contents
function highlightText(htmlStr, query) {
    if (!query) return htmlStr;
    
    // Parse to traverse DOM without modifying script tags/attributes
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlStr, 'text/html');
    
    const highlightNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
            if (regex.test(text)) {
                const span = document.createElement('span');
                span.innerHTML = text.replace(regex, '<span class="search-highlight">$1</span>');
                node.parentNode.replaceChild(span, node);
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            Array.from(node.childNodes).forEach(highlightNode);
        }
    };
    
    Array.from(doc.body.childNodes).forEach(highlightNode);
    return doc.body.innerHTML;
}

// Helper to escape regex special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Display Toast Notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-octagon';
    
    toast.innerHTML = `
        <i data-lucide="${iconName}" class="toast-icon"></i>
        <span class="toast-message">${message}</span>
    `;
    
    el.toastContainer.appendChild(toast);
    lucide.createIcons();
    
    // Animate out and remove toast after 3.5 seconds
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse';
        toast.addEventListener('animationend', () => toast.remove());
    }, 3500);
}

// Render Empty Results State
function renderEmptyState() {
    el.feedTimeline.innerHTML = `
        <div class="empty-state">
            <div class="error-icon-container" style="background-color: rgba(255,255,255,0.03); border-color: var(--border-color)">
                <i data-lucide="search-code" style="color: var(--text-muted); width: 32px; height: 32px;"></i>
            </div>
            <h3 class="loading-title">No matching updates</h3>
            <p class="loading-subtitle">Try adjusting your filters or searching for a different keyword.</p>
        </div>
    `;
    lucide.createIcons();
}
