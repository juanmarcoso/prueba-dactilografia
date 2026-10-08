window.TypingAPI = (() => {
  const BACKEND_URL = 'http://127.0.0.1:8000';
  let basePromise = null;

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function resolveBase() {
    if (window.__API_BASE__) return Promise.resolve(window.__API_BASE__);
    if (!/^https?:$/.test(window.location.protocol)) {
      return Promise.resolve(`${BACKEND_URL}/api`);
    }
    if (!basePromise) {
      basePromise = fetch('/api/stats/?days=30', { credentials: 'include' })
        .then((res) => {
          const type = res.headers.get('content-type') || '';
          return res.ok && type.includes('json') ? '/api' : `${BACKEND_URL}/api`;
        })
        .catch(() => `${BACKEND_URL}/api`);
    }
    return basePromise;
  }

  function messageFrom(body, status) {
    if (body && body.error) return body.error;
    if (body && body.errors) return Object.values(body.errors).join(' ');
    if (status === 403) return 'Petición rechazada por CSRF. Recarga la página e inténtalo de nuevo.';
    return `Error ${status} del servidor.`;
  }

  async function request(path, options = {}) {
    const base = await resolveBase();
    const method = (options.method || 'GET').toUpperCase();
    const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});

    if (method !== 'GET') {
      const token = getCookie('csrftoken');
      if (token) headers['X-CSRFToken'] = token;
      headers['Content-Type'] = 'application/json';
    }

    let response;
    try {
      response = await fetch(base + path, Object.assign({ credentials: 'include' }, options, { headers }));
    } catch (err) {
      throw new Error('No se pudo conectar con el backend. Comprueba que esté en marcha con «manage.py runserver».');
    }

    let body = null;
    try {
      body = await response.json();
    } catch (err) {
      body = null;
    }

    if (!response.ok) throw new Error(messageFrom(body, response.status));
    return body;
  }

  return {
    getText() {
      return request('/text/random/');
    },
    saveResult(payload) {
      return request('/results/', { method: 'POST', body: JSON.stringify(payload) });
    },
    getStats(days) {
      return request(`/stats/?days=${days}`);
    },
  };
})();
