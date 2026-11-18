/* Supabase Auth and account-scoped Cadence data. Study data is never cached locally. */
(() => {
  'use strict';

  const config = window.CADENCE_SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey);
  let client = null;
  let authSubscription = null;
  let channel = null, profileChannel = null;

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

  async function readProfile(expectedUserId) {
    const userId = await currentUser(expectedUserId);
    const table = getClient().from('cadence_profiles');
    let { data, error } = await table
      .select('user_id,display_name,avatar_path,updated_at')
      .maybeSingle();
    if (error) throw error;
    await currentUser(userId);
    if (!data) {
      const created = await table.insert({ display_name: '', avatar_path: null }).select('user_id,display_name,avatar_path,updated_at').single();
      if (created.error && created.error.code !== '23505') throw created.error;
      if (created.data) data = created.data;
      else {
        const existing = await table.select('user_id,display_name,avatar_path,updated_at').maybeSingle();
        if (existing.error) throw existing.error;
        data = existing.data;
      }
    }
    await currentUser(userId);
    if (!data || data.user_id !== userId) throw new Error('The profile owner did not match the signed-in user.');
    let avatarUrl = '';
    if (data.avatar_path) {
      const signed = await getClient().storage.from('cadence-avatars').createSignedUrl(data.avatar_path, 86400);
      if (signed.error) throw signed.error;
      avatarUrl = `${signed.data.signedUrl}&v=${encodeURIComponent(data.updated_at || '')}`;
    }
    await currentUser(userId);
    return { ...data, avatarUrl };
  }

  async function updateProfileName(name, expectedUserId) {
    const userId = await currentUser(expectedUserId);
    const displayName = String(name || '').trim();
    if (!displayName || displayName.length > 60) throw new Error('Display name must be 1 to 60 characters.');
    const { error } = await getClient().from('cadence_profiles')
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('user_id,display_name,avatar_path,updated_at')
      .single();
    if (error) throw error;
    await currentUser(userId);
    return readProfile(userId);
  }

  async function uploadAvatar(file, expectedUserId) {
    const userId = await currentUser(expectedUserId);
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!file || !allowed.includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
    const previous = await readProfile(userId);
    const path = `${userId}/avatar`;
    const storage = getClient().storage.from('cadence-avatars');
    const uploaded = await storage.upload(path, file, {
      cacheControl: '0', contentType: file.type, upsert: true
    });
    if (uploaded.error) throw uploaded.error;
    try {
      await currentUser(userId);
      const { error } = await getClient().from('cadence_profiles')
        .update({ avatar_path: path, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
      await currentUser(userId);
    } catch (error) {
      if (!previous.avatar_path) await storage.remove([path]).catch(() => {});
      throw error;
    }
    return readProfile(userId);
  }

  async function removeAvatar(expectedUserId) {
    const userId = await currentUser(expectedUserId);
    const path = `${userId}/avatar`;
    const previous = await readProfile(userId);
    const storage = getClient().storage.from('cadence-avatars');
    const backupResult = previous.avatar_path ? await storage.download(path) : null;
    if (backupResult?.error) throw backupResult.error;
    const { error: storageError } = await storage.remove([path]);
    if (storageError) return { profile: previous, cleanupError: storageError };
    await currentUser(userId);
    const { error: profileError } = await getClient().from('cadence_profiles')
      .update({ avatar_path: null, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (profileError) {
      if (backupResult?.data) {
        await storage.upload(path, backupResult.data, {
          cacheControl: '0', contentType: backupResult.data.type || 'image/png', upsert: true
        }).catch(() => {});
      }
      throw profileError;
    }
    return { profile: await readProfile(userId), cleanupError: null };
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

  function watchProfile(userId, onChange) {
    if (profileChannel) getClient().removeChannel(profileChannel);
    profileChannel = getClient()
      .channel(`cadence-profile:${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'cadence_profiles', filter: `user_id=eq.${userId}`
      }, () => { void readProfile(userId).then(onChange).catch(() => {}); })
      .subscribe();
    return profileChannel;
  }

  function stopWatching() {
    if (channel && client) client.removeChannel(channel);
    if (profileChannel && client) client.removeChannel(profileChannel);
    channel = null;
    profileChannel = null;
  }

  window.CadenceCloud = {
    configured,
    initialize,
    readData,
    readProfile,
    updateProfileName,
    uploadAvatar,
    removeAvatar,
    writeData,
    signUp,
    signIn,
    requestPasswordReset,
    updatePassword,
    signOut,
    watchUserData,
    watchProfile,
    stopWatching
  };
})();

