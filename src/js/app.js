/* ============================================
   FeedDeck — Shared App Logic
   时钟、工具函数、UI 组件
   ============================================ */

// 远距离观看模式：从 localStorage 读取并设置 data-distance 属性
// 由配置页后续添加 UI 开关，此处仅负责读取
(function() {
  if (localStorage.getItem('feeddeck_distance') === 'far') {
    document.documentElement.setAttribute('data-distance', 'far');
  }
})();

var app = (function () {
  'use strict';

  // --- 时钟 ---

  function updateClock(el) {
    if (!el) return;
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    el.textContent = h + ':' + m;
  }

  function startClock(selector) {
    var el = document.querySelector(selector);
    if (!el) return;
    updateClock(el);
    setInterval(function () { updateClock(el); }, 10000);
  }

  // --- 时间格式化 ---

  function timeAgo(ts) {
    var now = Date.now();
    var diff = Math.floor((now - ts) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return Math.floor(diff / 86400) + '天前';
  }

  function formatDate(date) {
    var d = date || new Date();
    var year = d.getFullYear();
    var month = d.getMonth() + 1;
    var day = d.getDate();
    var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return year + '年' + month + '月' + day + '日 周' + weekdays[d.getDay()];
  }

  // --- 问候语 ---

  function getGreeting() {
    var h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  }

  // --- Toast 提示 ---

  function showToast(msg, type) {
    type = type || 'success';
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.add('show');
    });

    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.remove(); }, 200);
    }, 2500);
  }

  // --- 骨架屏 ---

  function showLoading(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="skeleton skeleton-line w-full"></div>' +
      '<div class="skeleton skeleton-line w-3-4"></div>' +
      '<div class="skeleton skeleton-line w-1-2"></div>';
  }

  // --- 确认对话框 ---

  function confirm(message) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML =
        '<div class="modal">' +
          '<div class="modal-title">确认</div>' +
          '<p style="font-size:13px;color:var(--text-dim);">' + message + '</p>' +
          '<div class="modal-actions">' +
            '<button class="btn btn-ghost" data-action="cancel">取消</button>' +
            '<button class="btn btn-danger" data-action="confirm">确认</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function (e) {
        var action = e.target.getAttribute('data-action');
        if (action === 'cancel') {
          overlay.remove();
          resolve(false);
        } else if (action === 'confirm') {
          overlay.remove();
          resolve(true);
        }
      });
    });
  }

  // --- DOM 工具 ---

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  // --- 公开 ---

  return {
    startClock: startClock,
    timeAgo: timeAgo,
    formatDate: formatDate,
    getGreeting: getGreeting,
    showToast: showToast,
    showLoading: showLoading,
    confirm: confirm,
    $: $,
    $$: $$
  };
})();
