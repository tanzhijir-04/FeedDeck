/* ============================================
   FeedDeck — API Client
   封装所有后端请求，统一错误处理
   ============================================ */

var api = (function () {
  'use strict';

  var BASE = '/api';

  // --- 内部工具 ---

  function request(method, path, body) {
    var opts = {
      method: method,
      credentials: 'same-origin',
      headers: {}
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(BASE + path, opts).then(function (res) {
      if (res.status === 401) {
        window.location.href = '/';
        return Promise.reject(new Error('未登录'));
      }
      if (!res.ok) {
        return res.json().then(function (data) {
          return Promise.reject(new Error(data.error || '请求失败'));
        }).catch(function () {
          return Promise.reject(new Error('请求失败 (' + res.status + ')'));
        });
      }
      return res.json();
    });
  }

  function sha256(str) {
    var encoder = new TextEncoder();
    var data = encoder.encode(str);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  // --- 公开 API ---

  return {
    // 认证
    login: function (password) {
      return sha256(password).then(function (hash) {
        return request('POST', '/auth/login', { password: hash });
      });
    },

    logout: function () {
      return request('POST', '/auth/logout');
    },

    checkAuth: function () {
      return request('GET', '/auth/check');
    },

    // 仪表盘数据（单次返回所有模块）
    getDashboard: function () {
      return request('GET', '/dashboard');
    },

    // 配置
    getConfig: function () {
      return request('GET', '/config');
    },

    updateConfig: function (data) {
      return request('PUT', '/config', data);
    },

    // RSS
    addRss: function (url) {
      return request('POST', '/config/rss', { url: url });
    },

    deleteRss: function (key) {
      return request('DELETE', '/config/rss/' + encodeURIComponent(key));
    },

    // 密码
    changePassword: function (oldPwd, newPwd) {
      return Promise.all([sha256(oldPwd), sha256(newPwd)]).then(function (hashes) {
        return request('PUT', '/config/password', {
          old_password: hashes[0],
          new_password: hashes[1]
        });
      });
    },

    // 待办
    getTodos: function () {
      return request('GET', '/todos');
    },

    addTodo: function (data) {
      return request('POST', '/todos', data);
    },

    updateTodo: function (id, data) {
      return request('PUT', '/todos/' + id, data);
    },

    deleteTodo: function (id) {
      return request('DELETE', '/todos/' + id);
    },

    // 日历
    getCalendar: function (params) {
      var qs = params ? '?' + Object.keys(params).map(function (k) {
        return k + '=' + encodeURIComponent(params[k]);
      }).join('&') : '';
      return request('GET', '/calendar' + qs);
    },

    addCalendarEvent: function (data) {
      return request('POST', '/calendar', data);
    },

    updateCalendarEvent: function (id, data) {
      return request('PUT', '/calendar/' + id, data);
    },

    deleteCalendarEvent: function (id) {
      return request('DELETE', '/calendar/' + id);
    },

    // ICS
    addIcs: function (url) {
      return request('POST', '/config/ics', { url: url });
    },

    deleteIcs: function (id) {
      return request('DELETE', '/config/ics/' + encodeURIComponent(id));
    },

    triggerCron: function (path) {
      return fetch(path, { method: 'GET', credentials: 'same-origin' }).then(function (res) {
        if (res.status === 401) {
          window.location.href = '/';
          return Promise.reject(new Error('未登录'));
        }
        if (!res.ok) {
          return Promise.reject(new Error('请求失败 (' + res.status + ')'));
        }
        return res.json().catch(function () { return {}; });
      });
    }
  };
})();
