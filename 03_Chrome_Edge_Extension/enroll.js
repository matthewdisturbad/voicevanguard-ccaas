/**
 * Escolha da credencial de acesso ao relay (lógica pura, testada com node:test).
 * Preferência: credencial individual válida > cadastro com enrollToken > chave compartilhada da torre (legado).
 * Cadastro e renovação nunca acontecem durante uma chamada (In-Call Lock).
 */
(function (root) {
    const RENEW_BEFORE_SEC = 7 * 86400;
    const MAX_ENROLL_FAILURES = 3;

    function chooseAuth(s, nowSec) {
        const credOk = typeof s.credential === 'string' && s.credential.startsWith('vv1.') && Number(s.credentialExp) > nowSec;
        const nearExpiry = credOk && Number(s.credentialExp) - nowSec < RENEW_BEFORE_SEC;
        const canEnroll = !!s.enrollToken && !s.callActive && (s.enrollFailures || 0) < MAX_ENROLL_FAILURES;
        if (credOk && !(nearExpiry && canEnroll)) return { kind: 'credential', key: s.credential };
        if (canEnroll) return { kind: 'enroll' };
        if (s.tenantKey) return { kind: 'tower', key: s.tenantKey };
        return { kind: 'none' };
    }

    const api = { chooseAuth, MAX_ENROLL_FAILURES, RENEW_BEFORE_SEC };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.VVEnroll = api;
})(typeof self !== 'undefined' ? self : this);
