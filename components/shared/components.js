/**
 * CAOS CRM - Shared UI Components Library
 * Built on SnowUI Design System + Laws of UX
 *
 * This file provides reusable components following:
 * - Fitts's Law (proper touch targets)
 * - Jakob's Law (familiar patterns)
 * - Miller's Law (chunked information)
 * - Hick's Law (simplified choices)
 */

// ========== MODAL COMPONENT ==========
class Modal {
    constructor(options = {}) {
        this.title = options.title || 'Modal';
        this.content = options.content || '';
        this.onConfirm = options.onConfirm || (() => {});
        this.onCancel = options.onCancel || (() => {});
        this.confirmText = options.confirmText || 'Confirm';
        this.cancelText = options.cancelText || 'Cancel';
        this.size = options.size || 'medium'; // small, medium, large
        this.element = null;
    }

    show() {
        // Remove any existing modals
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());

        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.setAttribute('role', 'presentation');
        backdrop.setAttribute('aria-hidden', 'true');

        // Create modal
        const modal = document.createElement('div');
        modal.className = `modal modal-${this.size}`;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'modal-title');

        modal.innerHTML = `
            <div class="modal-header">
                <h2 id="modal-title" class="modal-title">${this.title}</h2>
                <button class="modal-close" aria-label="Close modal" tabindex="0">×</button>
            </div>
            <div class="modal-body">
                ${this.content}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary modal-cancel">${this.cancelText}</button>
                <button class="btn btn-primary modal-confirm">${this.confirmText}</button>
            </div>
        `;

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
        this.element = modal;

        // Focus first input or confirm button
        setTimeout(() => {
            const firstInput = modal.querySelector('input, textarea, select');
            if (firstInput) {
                firstInput.focus();
            } else {
                modal.querySelector('.modal-confirm').focus();
            }
        }, 100);

        // Event listeners
        modal.querySelector('.modal-close').addEventListener('click', () => this.hide());
        modal.querySelector('.modal-cancel').addEventListener('click', () => {
            this.onCancel();
            this.hide();
        });
        modal.querySelector('.modal-confirm').addEventListener('click', () => {
            this.onConfirm();
            this.hide();
        });
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) this.hide();
        });

        // Keyboard navigation
        document.addEventListener('keydown', this.handleKeydown.bind(this));

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        return this;
    }

    hide() {
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.style.overflow = '';
        document.removeEventListener('keydown', this.handleKeydown);
    }

    handleKeydown(e) {
        if (e.key === 'Escape') {
            this.hide();
        }
    }
}

// ========== TOAST NOTIFICATION ==========
class Toast {
    static show(message, type = 'info', duration = 3000) {
        // Create toast container if doesn't exist
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'true');
            document.body.appendChild(container);
        }

        // Create toast
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'status');

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Close notification">×</button>
        `;

        container.appendChild(toast);

        // Close button
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('toast-hiding');
            setTimeout(() => toast.remove(), 300);
        });

        // Auto remove
        setTimeout(() => {
            toast.classList.add('toast-hiding');
            setTimeout(() => toast.remove(), 300);
        }, duration);

        return toast;
    }
}

// ========== FORM BUILDER ==========
class FormBuilder {
    constructor(fields) {
        this.fields = fields;
    }

    render() {
        return this.fields.map(field => this.renderField(field)).join('');
    }

    renderField(field) {
        const {
            name,
            label,
            type = 'text',
            placeholder = '',
            required = false,
            value = '',
            options = [],
            validation = {}
        } = field;

        const id = `field-${name}`;
        const requiredAttr = required ? 'required' : '';
        const requiredLabel = required ? '<span class="required-indicator">*</span>' : '';

        switch (type) {
            case 'textarea':
                return `
                    <div class="form-group">
                        <label for="${id}" class="form-label">${label}${requiredLabel}</label>
                        <textarea
                            id="${id}"
                            name="${name}"
                            class="form-textarea"
                            placeholder="${placeholder}"
                            ${requiredAttr}
                            rows="4"
                        >${value}</textarea>
                        <span class="form-error" id="${id}-error"></span>
                    </div>
                `;

            case 'select':
                return `
                    <div class="form-group">
                        <label for="${id}" class="form-label">${label}${requiredLabel}</label>
                        <select id="${id}" name="${name}" class="form-select" ${requiredAttr}>
                            <option value="">Select ${label}</option>
                            ${options.map(opt => `
                                <option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>
                                    ${opt.label}
                                </option>
                            `).join('')}
                        </select>
                        <span class="form-error" id="${id}-error"></span>
                    </div>
                `;

            case 'checkbox':
                return `
                    <div class="form-group form-group-checkbox">
                        <label class="form-checkbox-label">
                            <input
                                type="checkbox"
                                id="${id}"
                                name="${name}"
                                class="form-checkbox"
                                ${value ? 'checked' : ''}
                            >
                            <span>${label}${requiredLabel}</span>
                        </label>
                        <span class="form-error" id="${id}-error"></span>
                    </div>
                `;

            default: // text, email, password, number, date
                return `
                    <div class="form-group">
                        <label for="${id}" class="form-label">${label}${requiredLabel}</label>
                        <input
                            type="${type}"
                            id="${id}"
                            name="${name}"
                            class="form-input"
                            placeholder="${placeholder}"
                            value="${value}"
                            ${requiredAttr}
                            ${validation.min ? `min="${validation.min}"` : ''}
                            ${validation.max ? `max="${validation.max}"` : ''}
                            ${validation.pattern ? `pattern="${validation.pattern}"` : ''}
                        >
                        <span class="form-error" id="${id}-error"></span>
                    </div>
                `;
        }
    }

    validate(formElement) {
        let isValid = true;
        const formData = new FormData(formElement);

        this.fields.forEach(field => {
            const input = formElement.querySelector(`[name="${field.name}"]`);
            const errorEl = document.getElementById(`field-${field.name}-error`);
            const value = formData.get(field.name);

            // Clear previous errors
            input.classList.remove('form-input-error');
            if (errorEl) errorEl.textContent = '';

            // Required validation
            if (field.required && !value) {
                isValid = false;
                input.classList.add('form-input-error');
                if (errorEl) errorEl.textContent = `${field.label} is required`;
                return;
            }

            // Custom validation
            if (field.validation && value) {
                if (field.validation.minLength && value.length < field.validation.minLength) {
                    isValid = false;
                    input.classList.add('form-input-error');
                    if (errorEl) errorEl.textContent = `Minimum ${field.validation.minLength} characters`;
                }

                if (field.validation.email && !this.isValidEmail(value)) {
                    isValid = false;
                    input.classList.add('form-input-error');
                    if (errorEl) errorEl.textContent = 'Invalid email address';
                }
            }
        });

        return isValid;
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    getData(formElement) {
        const formData = new FormData(formElement);
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }
        return data;
    }
}

// ========== DATA TABLE ==========
class DataTable {
    constructor(options = {}) {
        this.columns = options.columns || [];
        this.data = options.data || [];
        this.searchable = options.searchable !== false;
        this.sortable = options.sortable !== false;
        this.pagination = options.pagination !== false;
        this.pageSize = options.pageSize || 10;
        this.currentPage = 1;
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.searchTerm = '';
    }

    render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const html = `
            ${this.searchable ? this.renderSearch() : ''}
            <div class="table-wrapper">
                <table class="data-table" role="table">
                    ${this.renderHeader()}
                    ${this.renderBody()}
                </table>
            </div>
            ${this.pagination ? this.renderPagination() : ''}
        `;

        container.innerHTML = html;
        this.attachEventListeners(container);
    }

    renderSearch() {
        return `
            <div class="table-search">
                <input
                    type="search"
                    class="table-search-input"
                    placeholder="Search..."
                    aria-label="Search table"
                >
            </div>
        `;
    }

    renderHeader() {
        return `
            <thead>
                <tr role="row">
                    ${this.columns.map(col => `
                        <th role="columnheader"
                            ${this.sortable && col.sortable !== false ? 'class="sortable" data-column="' + col.field + '"' : ''}>
                            ${col.label}
                            ${this.sortable && col.sortable !== false ? '<span class="sort-icon">↕</span>' : ''}
                        </th>
                    `).join('')}
                </tr>
            </thead>
        `;
    }

    renderBody() {
        const filteredData = this.getFilteredData();
        const paginatedData = this.pagination ? this.getPaginatedData(filteredData) : filteredData;

        if (paginatedData.length === 0) {
            return `
                <tbody>
                    <tr>
                        <td colspan="${this.columns.length}" class="table-empty">
                            No data found
                        </td>
                    </tr>
                </tbody>
            `;
        }

        return `
            <tbody>
                ${paginatedData.map(row => `
                    <tr role="row">
                        ${this.columns.map(col => `
                            <td role="cell">
                                ${col.render ? col.render(row[col.field], row) : row[col.field] || ''}
                            </td>
                        `).join('')}
                    </tr>
                `).join('')}
            </tbody>
        `;
    }

    renderPagination() {
        const filteredData = this.getFilteredData();
        const totalPages = Math.ceil(filteredData.length / this.pageSize);

        if (totalPages <= 1) return '';

        return `
            <div class="table-pagination">
                <button class="pagination-btn" data-action="first" ${this.currentPage === 1 ? 'disabled' : ''}>
                    ««
                </button>
                <button class="pagination-btn" data-action="prev" ${this.currentPage === 1 ? 'disabled' : ''}>
                    «
                </button>
                <span class="pagination-info">
                    Page ${this.currentPage} of ${totalPages}
                </span>
                <button class="pagination-btn" data-action="next" ${this.currentPage === totalPages ? 'disabled' : ''}>
                    »
                </button>
                <button class="pagination-btn" data-action="last" ${this.currentPage === totalPages ? 'disabled' : ''}>
                    »»
                </button>
            </div>
        `;
    }

    getFilteredData() {
        if (!this.searchTerm) return this.data;

        return this.data.filter(row => {
            return this.columns.some(col => {
                const value = row[col.field];
                return value && String(value).toLowerCase().includes(this.searchTerm.toLowerCase());
            });
        });
    }

    getPaginatedData(data) {
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        return data.slice(start, end);
    }

    attachEventListeners(container) {
        // Search
        const searchInput = container.querySelector('.table-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.currentPage = 1;
                this.render(container.id);
            });
        }

        // Sort
        container.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const column = th.dataset.column;
                if (this.sortColumn === column) {
                    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortColumn = column;
                    this.sortDirection = 'asc';
                }
                this.sortData();
                this.render(container.id);
            });
        });

        // Pagination
        container.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const filteredData = this.getFilteredData();
                const totalPages = Math.ceil(filteredData.length / this.pageSize);

                switch (action) {
                    case 'first': this.currentPage = 1; break;
                    case 'prev': this.currentPage = Math.max(1, this.currentPage - 1); break;
                    case 'next': this.currentPage = Math.min(totalPages, this.currentPage + 1); break;
                    case 'last': this.currentPage = totalPages; break;
                }

                this.render(container.id);
            });
        });
    }

    sortData() {
        if (!this.sortColumn) return;

        this.data.sort((a, b) => {
            const aVal = a[this.sortColumn];
            const bVal = b[this.sortColumn];

            if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    updateData(newData) {
        this.data = newData;
        this.currentPage = 1;
    }
}

// ========== LOADING SPINNER ==========
class LoadingSpinner {
    static show(message = 'Loading...') {
        const existing = document.getElementById('loading-spinner');
        if (existing) existing.remove();

        const spinner = document.createElement('div');
        spinner.id = 'loading-spinner';
        spinner.className = 'loading-spinner';
        spinner.setAttribute('role', 'status');
        spinner.setAttribute('aria-live', 'polite');
        spinner.innerHTML = `
            <div class="spinner-content">
                <div class="spinner"></div>
                <p class="spinner-message">${message}</p>
            </div>
        `;

        document.body.appendChild(spinner);
        return spinner;
    }

    static hide() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.remove();
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Modal, Toast, FormBuilder, DataTable, LoadingSpinner };
}

// Make available globally
if (typeof window !== 'undefined') {
    window.Modal = Modal;
    window.Toast = Toast;
    window.FormBuilder = FormBuilder;
    window.DataTable = DataTable;
    window.LoadingSpinner = LoadingSpinner;
}
