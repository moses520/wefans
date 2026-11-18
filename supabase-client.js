(function () {
  const config = window.WEFANS_SUPABASE_CONFIG || {};
  let client = null;
  let rememberSession = false;
  let rememberPreferenceSet = false;

  const sessionStorageAdapter = {
    async getItem(key) {
      const persistentSession = window.localStorage.getItem(key);
      if (persistentSession !== null) {
        if (!rememberPreferenceSet) rememberSession = true;
        return persistentSession;
      }
      const temporarySession = window.sessionStorage.getItem(key);
      if (!rememberPreferenceSet) rememberSession = false;
      return temporarySession;
    },
    async setItem(key, value) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
      const storage = rememberSession ? window.localStorage : window.sessionStorage;
      storage.setItem(key, value);
    },
    async removeItem(key) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  };

  function getClient() {
    if (!client) {
      throw new Error("Supabase is not connected. Complete the setup in README.md.");
    }
    return client;
  }

  function throwIfError(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  async function getCurrentUser() {
    return throwIfError(await getClient().auth.getUser()).user;
  }

  async function getConversation(id) {
    const result = await getClient()
      .from("conversations")
      .select("id, client_id, freelancer_id, client_display_name, freelancer_display_name, category, updated_at")
      .eq("id", id)
      .single();
    return throwIfError(result);
  }

  window.WefansDB = {
    isConfigured() {
      return Boolean(config.url && config.anonKey);
    },

    isReady() {
      return Boolean(client);
    },

    async initialize() {
      if (!this.isConfigured()) return { configured: false, user: null };
      if (!window.supabase || typeof window.supabase.createClient !== "function") {
        throw new Error("The Supabase client library did not load. Check your internet connection and reload.");
      }

      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
          storage: sessionStorageAdapter
        }
      });

      const result = await client.auth.getSession();
      const session = throwIfError(result).session;
      return { configured: true, user: session ? session.user : null };
    },

    onAuthChange(callback) {
      return getClient().auth.onAuthStateChange((event, session) => {
        callback(session ? session.user : null, event);
      }).data.subscription;
    },

    setRememberSession(remember) {
      rememberSession = Boolean(remember);
      rememberPreferenceSet = true;
    },

    async signUp({ name, email, password, role }) {
      return throwIfError(await getClient().auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: name.trim(),
            role: role === "sell" ? "freelancer" : "client"
          },
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`
        }
      }));
    },

    async signIn({ email, password }) {
      return throwIfError(await getClient().auth.signInWithPassword({ email, password }));
    },

    async signOut() {
      throwIfError(await getClient().auth.signOut());
      rememberSession = false;
      rememberPreferenceSet = false;
    },

    async resetPassword(email) {
      throwIfError(await getClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${window.location.pathname}`
      }));
    },

    async updatePassword(password) {
      throwIfError(await getClient().auth.updateUser({ password }));
    },

    async getProfile() {
      const user = await getCurrentUser();
      if (!user) return null;

      const profile = throwIfError(await getClient()
        .from("profiles")
        .select("id, display_name, role")
        .eq("id", user.id)
        .single());

      if (profile.role !== "freelancer") return profile;

      const freelancer = throwIfError(await getClient()
        .from("freelancer_profiles")
        .select("headline, bio")
        .eq("user_id", user.id)
        .single());
      return { ...profile, ...freelancer };
    },

    async updateFreelancerProfile({ headline, bio }) {
      const user = await getCurrentUser();
      if (!user) throw new Error("Sign in to update your freelancer profile.");
      return throwIfError(await getClient()
        .from("freelancer_profiles")
        .update({ headline: headline.trim(), bio: bio.trim() })
        .eq("user_id", user.id)
        .select("user_id, headline, bio")
        .single());
    },

    async fetchPublishedListings() {
      return throwIfError(await getClient()
        .from("listings")
        .select("id, freelancer_id, category, title, description, price_cents, tags, created_at, freelancer_profiles!inner(display_name, headline, bio)")
        .eq("published", true)
        .order("created_at", { ascending: false }));
    },

    async fetchMyListings() {
      const user = await getCurrentUser();
      if (!user) throw new Error("Sign in to manage your services.");
      return throwIfError(await getClient()
        .from("listings")
        .select("id, category, title, description, price_cents, tags, published, created_at")
        .eq("freelancer_id", user.id)
        .order("created_at", { ascending: false }));
    },

    async createListing({ category, title, description, priceCents, tags }) {
      const user = await getCurrentUser();
      if (!user) throw new Error("Sign in to publish a service.");
      return throwIfError(await getClient()
        .from("listings")
        .insert({
          freelancer_id: user.id,
          category,
          title: title.trim(),
          description: description.trim(),
          price_cents: priceCents,
          tags: tags.map((tag) => tag.trim()).filter(Boolean),
          published: true
        })
        .select("id")
        .single());
    },

    async setListingPublished(id, published) {
      return throwIfError(await getClient()
        .from("listings")
        .update({ published })
        .eq("id", id)
        .select("id")
        .single());
    },

    async deleteListing(id) {
      const result = await getClient().from("listings").delete().eq("id", id);
      throwIfError(result);
    },

    async fetchConversations() {
      const user = await getCurrentUser();
      if (!user) throw new Error("Sign in to view your messages.");

      const rows = throwIfError(await getClient()
        .from("conversations")
        .select("id, client_id, freelancer_id, client_display_name, freelancer_display_name, category, updated_at")
        .or(`client_id.eq.${user.id},freelancer_id.eq.${user.id}`)
        .order("updated_at", { ascending: false }));

      return rows.map((row) => ({
        id: row.id,
        freelancerId: row.client_id === user.id ? row.freelancer_id : row.client_id,
        freelancerName: row.client_id === user.id ? row.freelancer_display_name : row.client_display_name,
        category: row.category,
        updatedAt: row.updated_at,
        messages: []
      }));
    },

    async getOrCreateConversation(freelancerId, category) {
      const user = await getCurrentUser();
      if (!user) throw new Error("Sign in to message a freelancer.");

      const existing = await getClient()
        .from("conversations")
        .select("id")
        .eq("client_id", user.id)
        .eq("freelancer_id", freelancerId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) return getConversation(existing.data.id);

      const inserted = await getClient()
        .from("conversations")
        .insert({ client_id: user.id, freelancer_id: freelancerId, category })
        .select("id")
        .single();
      if (inserted.error && inserted.error.code === "23505") {
        const duplicate = await getClient()
          .from("conversations")
          .select("id")
          .eq("client_id", user.id)
          .eq("freelancer_id", freelancerId)
          .single();
        return getConversation(throwIfError(duplicate).id);
      }
      return getConversation(throwIfError(inserted).id);
    },

    async fetchMessages(conversationId) {
      return throwIfError(await getClient()
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true }));
    },

    async sendMessage(conversationId, body) {
      const user = await getCurrentUser();
      if (!user) throw new Error("Sign in to send messages.");
      return throwIfError(await getClient()
        .from("messages")
        .insert({ conversation_id: conversationId, sender_id: user.id, body: body.trim() })
        .select("id, conversation_id, sender_id, body, created_at")
        .single());
    },

    subscribeToMessages(conversationId, onMessage, onError) {
      return getClient()
        .channel(`wefans-messages-${conversationId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`
        }, (payload) => onMessage(payload.new))
        .subscribe((status, error) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            onError(error || new Error(`Realtime chat subscription ${status.toLowerCase()}.`));
          }
        });
    },

    async removeChannel(channel) {
      if (channel) await getClient().removeChannel(channel);
    }
  };
})();
