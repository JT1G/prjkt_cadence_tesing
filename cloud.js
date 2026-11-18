/* Supabase Auth and account-scoped Cadence data. Study data is never cached locally. */
(() => {
  'use strict';

  const config = window.CADENCE_SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey);
  let client = null;
  let authSubscription = null;
  let channel = null;

  function getClient() {
    if (!configured) throw new Error('Supabase is not configured yet.');
    if (!window.supabase?.createClient) throw new Error('The Supabase client could not load. Check your connection and reload Cadence.');
    if (!client) client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  async function initialize(onAuthChange) {
    const supabase = getClient();
    if (!authSubscription) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        // Defer application work until the SDK's auth callback has returned.
        queueMicrotask(() => onAuthChange?.(event, session));
      });
      authSubscription = data.subscription;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function currentUser(expectedUserId) {
    const { data, error } = await getClient().auth.getSession();
    if (error) throw error;
    const id = data.session?.user?.id;
    if (!id || expectedUserId && id !== expectedUserId) throw new Error('The signed-in account changed. Reload Cadence before continuing.');
    return id;
  }

  async function readData(expectedUserId) {
    await currentUser(expectedUserId);
    const { data, error } = await getClient()
      .from('cadence_user_data')
      .select('user_id,data,revision,imported_guest_fingerprints,updated_at')
      .maybeSingle();
    if (error) throw error;
    await currentUser(expectedUserId);
    if (data && data.user_id !== expectedUserId) throw new Error('The account data owner did not match the signed-in user.');
    return data || { data: null, revision: 0, imported_guest_fingerprints: [], updated_at: null };
  }

  async function writeData(data, revision, importFingerprint = null, expectedUserId) {
    await currentUser(expectedUserId);
    const { data: result, error } = await getClient().rpc('save_cadence_user_data', {
      p_data: data,
      p_expected_revision: revision,
      p_import_fingerprint: importFingerprint
    });
    if (error) throw error;
    await currentUser(expectedUserId);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row || !Number.isFinite(Number(row.revision))) throw new Error('Cadence did not receive a cloud save confirmation.');
    return { ...row, revision: Number(row.revision) };
  }

  async function signUp(email, password) {
    return getClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}${location.pathname}` }
    });
  }

  async function signIn(email, password) {
    return getClient().auth.signInWithPassword({ email, password });
  }

  async function requestPasswordReset(email) {
    return getClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}${location.pathname}`
    });
  }

  async function updatePassword(password) {
    return getClient().auth.updateUser({ password });
  }

  async function signOut() {
    if (!client) return { error: null };
    return client.auth.signOut({ scope: 'local' });
  }

  function watchUserData(userId, onChange, onStatus) {
    stopWatching();
    channel = getClient()
      .channel(`cadence-data:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cadence_user_data',
        filter: `user_id=eq.${userId}`
      }, payload => {
        if (payload.eventType !== 'DELETE' && payload.new) onChange(payload.new);
      })
      .subscribe(status => onStatus?.(status));
    return stopWatching;
  }

  function stopWatching() {
    if (channel && client) client.removeChannel(channel);
    channel = null;
  }

  window.CadenceCloud = {
    configured,
    initialize,
    readData,
    writeData,
    signUp,
    signIn,
    requestPasswordReset,
    updatePassword,
    signOut,
    watchUserData,
    stopWatching
  };
})();
