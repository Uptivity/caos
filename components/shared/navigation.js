/**
 * CAOS CRM - Shared Navigation Component
 * Sidebar + Header following Jakob's Law (familiar CRM patterns)
 */

class Navigation {
    constructor() {
        this.currentPage = this.getCurrentPage();
        this.userData = null;
        this.sidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('dashboard')) return 'dashboard';
        if (path.includes('leads')) return 'leads';
        if (path.includes('tasks')) return 'tasks';
        if (path.includes('campaigns')) return 'campaigns';
        if (path.includes('products')) return 'products';
        if (path.includes('calendar')) return 'calendar';
        if (path.includes('email')) return 'email';
        if (path.includes('reports')) return 'reports';
        if (path.includes('teams')) return 'teams';
        if (path.includes('documents')) return 'documents';
        if (path.includes('settings')) return 'settings';
        return 'dashboard';
    }

    render() {
        // Get user data
        if (typeof apiClient !== 'undefined') {
            this.userData = apiClient.getUserData();
        }

        const userName = this.userData ? (this.userData.name || this.userData.email?.split('@')[0] || 'User') : 'User';
        const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

        const nav = document.createElement('div');
        nav.className = 'app-layout';
        nav.innerHTML = `
            ${this.renderSidebar()}
            <div class="app-main">
                ${this.renderHeader(userName, userInitials)}
                <main class="app-content" id="app-content" role="main">
                    <!-- Page content will be inserted here -->
                </main>
            </div>
        `;

        return nav;
    }

    renderSidebar() {
        const menuItems = [
            { id: 'dashboard', icon: '📊', label: 'Dashboard', path: '../dashboard/Dashboard.html' },
            { id: 'leads', icon: '👥', label: 'Leads', path: '../leads/Leads.html' },
            { id: 'tasks', icon: '✓', label: 'Tasks', path: '../tasks/Tasks.html' },
            { id: 'campaigns', icon: '📧', label: 'Campaigns', path: '../campaigns/Campaigns.html' },
            { id: 'products', icon: '📦', label: 'Products', path: '../products/Products.html' },
            { id: 'calendar', icon: '📅', label: 'Calendar', path: '../calendar/Calendar.html' },
            { id: 'email', icon: '✉️', label: 'Email', path: '../email/Email.html' },
            { id: 'reports', icon: '📈', label: 'Reports', path: '../reports/Reports.html' },
            { id: 'teams', icon: '👨‍💼', label: 'Teams', path: '../teams/Teams.html' },
            { id: 'documents', icon: '📄', label: 'Documents', path: '../documents/Documents.html' },
            { id: 'settings', icon: '⚙️', label: 'Settings', path: '../settings/Settings.html' }
        ];

        return `
            <aside class="sidebar ${this.sidebarCollapsed ? 'sidebar-collapsed' : ''}"
                   role="navigation"
                   aria-label="Main navigation">

                <!-- Logo/Brand -->
                <div class="sidebar-header">
                    <div class="sidebar-logo">
                        <span class="logo-icon">⚡</span>
                        <span class="logo-text">CAOS CRM</span>
                    </div>
                    <button class="sidebar-toggle"
                            aria-label="Toggle sidebar"
                            aria-expanded="${!this.sidebarCollapsed}"
                            onclick="navigation.toggleSidebar()">
                        <span class="toggle-icon">${this.sidebarCollapsed ? '»' : '«'}</span>
                    </button>
                </div>

                <!-- Navigation Menu -->
                <nav class="sidebar-nav">
                    ${menuItems.map(item => `
                        <a href="${item.path}"
                           class="sidebar-item ${this.currentPage === item.id ? 'sidebar-item-active' : ''}"
                           aria-current="${this.currentPage === item.id ? 'page' : 'false'}"
                           title="${item.label}">
                            <span class="sidebar-item-icon">${item.icon}</span>
                            <span class="sidebar-item-label">${item.label}</span>
                        </a>
                    `).join('')}
                </nav>

                <!-- Sidebar Footer -->
                <div class="sidebar-footer">
                    <button class="sidebar-item" onclick="navigation.showHelp()" title="Help & Support">
                        <span class="sidebar-item-icon">❓</span>
                        <span class="sidebar-item-label">Help</span>
                    </button>
                </div>
            </aside>
        `;
    }

    renderHeader(userName, userInitials) {
        return `
            <header class="app-header" role="banner">
                <div class="header-left">
                    <h1 class="header-title">${this.getPageTitle()}</h1>
                    <nav class="breadcrumb" aria-label="Breadcrumb">
                        <a href="../dashboard/Dashboard.html">Home</a>
                        <span class="breadcrumb-separator">/</span>
                        <span class="breadcrumb-current">${this.getPageTitle()}</span>
                    </nav>
                </div>

                <div class="header-right">
                    <!-- Search -->
                    <button class="header-btn"
                            aria-label="Search"
                            title="Search"
                            onclick="navigation.showSearch()">
                        <span>🔍</span>
                    </button>

                    <!-- Notifications -->
                    <button class="header-btn header-notifications"
                            aria-label="Notifications"
                            title="Notifications"
                            onclick="navigation.showNotifications()">
                        <span>🔔</span>
                        <span class="notification-badge" aria-label="3 unread notifications">3</span>
                    </button>

                    <!-- User Menu -->
                    <div class="header-user-menu">
                        <button class="user-avatar"
                                aria-label="User menu"
                                aria-haspopup="true"
                                onclick="navigation.toggleUserMenu()">
                            ${userInitials}
                        </button>
                        <div class="user-menu-dropdown" id="userMenuDropdown" hidden>
                            <div class="user-menu-header">
                                <div class="user-menu-name">${userName}</div>
                                <div class="user-menu-email">${this.userData?.email || ''}</div>
                            </div>
                            <div class="user-menu-divider"></div>
                            <a href="../settings/Settings.html" class="user-menu-item">
                                <span>⚙️</span> Settings
                            </a>
                            <a href="#" class="user-menu-item" onclick="navigation.logout(); return false;">
                                <span>🚪</span> Logout
                            </a>
                        </div>
                    </div>
                </div>
            </header>
        `;
    }

    getPageTitle() {
        const titles = {
            dashboard: 'Dashboard',
            leads: 'Leads',
            tasks: 'Tasks',
            campaigns: 'Campaigns',
            products: 'Products',
            calendar: 'Calendar',
            email: 'Email',
            reports: 'Reports',
            teams: 'Teams',
            documents: 'Documents',
            settings: 'Settings'
        };
        return titles[this.currentPage] || 'Dashboard';
    }

    toggleSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        localStorage.setItem('sidebar_collapsed', this.sidebarCollapsed);

        const sidebar = document.querySelector('.sidebar');
        const toggleBtn = document.querySelector('.sidebar-toggle');
        const toggleIcon = document.querySelector('.toggle-icon');

        if (sidebar) {
            sidebar.classList.toggle('sidebar-collapsed');
            toggleBtn.setAttribute('aria-expanded', !this.sidebarCollapsed);
            toggleIcon.textContent = this.sidebarCollapsed ? '»' : '«';
        }
    }

    toggleUserMenu() {
        const dropdown = document.getElementById('userMenuDropdown');
        const isHidden = dropdown.hasAttribute('hidden');

        if (isHidden) {
            dropdown.removeAttribute('hidden');
        } else {
            dropdown.setAttribute('hidden', '');
        }

        // Close when clicking outside
        if (isHidden) {
            setTimeout(() => {
                document.addEventListener('click', this.closeUserMenuOnClickOutside.bind(this));
            }, 0);
        }
    }

    closeUserMenuOnClickOutside(e) {
        const dropdown = document.getElementById('userMenuDropdown');
        const userMenu = document.querySelector('.header-user-menu');

        if (!userMenu.contains(e.target)) {
            dropdown.setAttribute('hidden', '');
            document.removeEventListener('click', this.closeUserMenuOnClickOutside);
        }
    }

    showSearch() {
        Toast.show('Search functionality coming soon', 'info');
    }

    showNotifications() {
        Toast.show('No new notifications', 'info');
    }

    showHelp() {
        const modal = new Modal({
            title: 'Help & Support',
            content: `
                <p><strong>Welcome to CAOS CRM!</strong></p>
                <p>Need help? Here are some resources:</p>
                <ul>
                    <li>📖 <a href="#" target="_blank">Documentation</a></li>
                    <li>💬 <a href="#" target="_blank">Community Forum</a></li>
                    <li>✉️ Email: support@caos.com</li>
                </ul>
                <p><strong>Keyboard Shortcuts:</strong></p>
                <ul>
                    <li><kbd>Ctrl</kbd> + <kbd>K</kbd> - Quick search</li>
                    <li><kbd>Ctrl</kbd> + <kbd>N</kbd> - New lead</li>
                    <li><kbd>Esc</kbd> - Close modal</li>
                </ul>
            `,
            confirmText: 'Got it',
            cancelText: ''
        });
        modal.show();
    }

    logout() {
        if (confirm('Are you sure you want to logout?')) {
            if (typeof apiClient !== 'undefined') {
                apiClient.logout();
            } else {
                window.location.href = '../auth/login.html';
            }
        }
    }

    // Initialize navigation on page load
    static init() {
        const navigation = new Navigation();

        // Replace body content with navigation
        const originalContent = document.getElementById('page-content');
        if (originalContent) {
            const nav = navigation.render();
            const appContent = nav.querySelector('#app-content');
            appContent.appendChild(originalContent);
            document.body.innerHTML = '';
            document.body.appendChild(nav);
        }

        // Make navigation globally available
        window.navigation = navigation;

        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'k':
                        e.preventDefault();
                        navigation.showSearch();
                        break;
                }
            }
        });
    }
}

// Auto-initialize if apiClient exists (means user is authenticated)
if (typeof apiClient !== 'undefined' && apiClient.isAuthenticated()) {
    document.addEventListener('DOMContentLoaded', () => {
        Navigation.init();
    });
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Navigation;
}
if (typeof window !== 'undefined') {
    window.Navigation = Navigation;
}
