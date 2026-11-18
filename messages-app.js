(() => {
  const params = new URLSearchParams(window.location.search);
  const requestedFreelancerId = params.get("freelancerId");
  const requestedCategory = (params.get("category") || "").slice(0, 100);
  const sampleName = (params.get("sampleName") || "").slice(0, 100);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const authCard = document.querySelector("#auth-card");
  const authTitle = document.querySelector("#auth-title");
  const authForm = document.querySelector("#auth-form");
  const authError = document.querySelector("#auth-error");
  const authSubmit = document.querySelector("#auth-submit");
  const messagesLayout = document.querySelector("#messages-layout");
  const pageTitle = document.querySelector("#page-title");
  const pageDescription = document.querySelector("#page-description");
  const pageStatus = document.querySelector("#page-status");
  const conversationList = document.querySelector("#conversation-list");
  const conversationName = document.querySelector("#conversation-name");
  const conversationCategory = document.querySelector("#conversation-category");
  const conversationEmpty = document.querySelector("#conversation-empty");
  const emptyTitle = document.querySelector("#empty-title");
  const emptyDescription = document.querySelector("#empty-description");
  const messageThread = document.querySelector("#message-thread");
  const messageForm = document.querySelector("#message-form");
  const messageInput = document.querySelector("#message-input");
  const sendButton = document.querySelector("#send-button");

  let currentUser = null;
  let currentProfile = null;
  let conversations = [];
  let activeConversationId = null;
  let activeChannel = null;

  function setStatus(message, isError) {
    pageStatus.textContent = message || "";
    pageStatus.classList.toggle("error", Boolean(isError));
    pageStatus.hidden = !message;
  }

  function reportError(action, error) {
    console.error(`${action} failed.`, error);
    setStatus(`${action} failed: ${error.message || "Please try again."}`, true);
  }

  function renderConversationList() {
    conversationList.replaceChildren();
    if (!conversations.length) {
      const empty = document.createElement("p");
      empty.className = "conversation-empty";
      empty.textContent = currentProfile
        ? "No conversations yet. Contact a published freelancer service to start one."
        : "Sign in to view your conversations.";
      conversationList.append(empty);
      return;
    }

    conversations
      .slice()
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .forEach((conversation) => {
        const button = document.createElement("button");
        button.className = `conversation-button${conversation.id === activeConversationId ? " active" : ""}`;
        button.type = "button";
        button.dataset.conversationId = conversation.id;
        button.setAttribute("aria-pressed", String(conversation.id === activeConversationId));

        const name = document.createElement("strong");
        name.textContent = conversation.otherUserName;
        const category = document.createElement("span");
        category.textContent = conversation.category || "Conversation";
        button.append(name, category);
        conversationList.append(button);
      });
  }

  function renderConversation() {
    const conversation = conversations.find((item) => item.id === activeConversationId);
    messageThread.replaceChildren();

    if (!conversation) {
      conversationName.textContent = "Choose a conversation";
      conversationCategory.textContent = "";
      emptyTitle.textContent = "Your messages will appear here.";
      emptyDescription.textContent = "Choose a conversation or contact a freelancer to get started.";
      conversationEmpty.hidden = false;
      messageThread.hidden = true;
      messageForm.hidden = true;
      return;
    }

    pageTitle.textContent = conversation.otherUserName;
    conversationName.textContent = conversation.otherUserName;
    conversationCategory.textContent = conversation.category || "Wefans conversation";

    conversation.messages.forEach((message) => {
      const row = document.createElement("div");
      row.className = `message-row${message.sender_id === currentUser.id ? " mine" : ""}`;
      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      bubble.textContent = message.body;
      const time = document.createElement("time");
      time.className = "message-time";
      time.dateTime = message.created_at;
      time.textContent = new Date(message.created_at).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short"
      });
      row.append(bubble, time);
      messageThread.append(row);
    });

    conversationEmpty.hidden = true;
    messageThread.hidden = false;
    messageForm.hidden = false;
    messageThread.scrollTop = messageThread.scrollHeight;
  }

  async function loadConversations() {
    const rows = await window.WefansDB.fetchConversations();
    conversations = rows.map((row) => ({
      id: row.id,
      otherUserId: row.freelancerId,
      otherUserName: row.freelancerName,
      category: row.category,
      updatedAt: row.updatedAt,
      messages: []
    }));
    if (!conversations.some((item) => item.id === activeConversationId)) activeConversationId = null;
    renderConversationList();
    renderConversation();
  }

  async function loadMessages(conversationId) {
    const messages = await window.WefansDB.fetchMessages(conversationId);
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    conversation.messages = messages;
    renderConversation();
  }

  async function activateConversation(conversationId) {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error("That conversation is no longer available.");
    if (activeChannel) await window.WefansDB.removeChannel(activeChannel);
    activeChannel = null;
    activeConversationId = conversationId;
    renderConversationList();
    renderConversation();
    await loadMessages(conversationId);
    activeChannel = window.WefansDB.subscribeToMessages(
      conversationId,
      async () => {
        try {
          await loadConversations();
          await loadMessages(conversationId);
        } catch (error) {
          reportError("Refreshing messages", error);
        }
      },
      (error) => reportError("Realtime chat", error)
    );
  }

  async function openRequestedConversation() {
    if (sampleName) {
      setStatus(`${sampleName} is a sample profile and is not connected to a real Wefans account. Messages cannot be delivered to this demo listing.`);
      return;
    }
    if (!requestedFreelancerId) {
      if (conversations.length) {
        await activateConversation(conversations[0].id);
      } else {
        setStatus("No conversations yet. Browse freelancers and message a published service to start one.");
      }
      return;
    }
    if (!uuidPattern.test(requestedFreelancerId)) {
      setStatus("The freelancer link is invalid. Return to the marketplace and choose a published service.", true);
      return;
    }
    if (currentProfile.role !== "client") {
      if (requestedFreelancerId !== currentUser.id) {
        setStatus("Only client accounts can start a new conversation. Your existing client conversations are listed on the left.");
      } else if (!conversations.length) {
        setStatus("This is your own service. Client conversations will appear here when someone contacts you.");
        return;
      }
      if (conversations.length) await activateConversation(conversations[0].id);
      return;
    }
    if (requestedFreelancerId === currentUser.id) {
      setStatus("You cannot start a conversation with your own service.", true);
      return;
    }

    const row = await window.WefansDB.getOrCreateConversation(requestedFreelancerId, requestedCategory);
    await loadConversations();
    if (!conversations.some((item) => item.id === row.id)) {
      conversations.unshift({
        id: row.id,
        otherUserId: row.freelancer_id,
        otherUserName: row.freelancer_display_name,
        category: row.category,
        updatedAt: row.updated_at,
        messages: []
      });
      renderConversationList();
    }
    await activateConversation(row.id);
  }

  async function syncAccount(user) {
    currentUser = user;
    if (activeChannel) await window.WefansDB.removeChannel(activeChannel);
    activeChannel = null;
    activeConversationId = null;
    conversations = [];

    if (!user) {
      currentProfile = null;
      messagesLayout.hidden = true;
      authCard.hidden = false;
      authTitle.textContent = requestedFreelancerId
        ? "Sign in to message this freelancer"
        : "Sign in to view your messages";
      renderConversationList();
      renderConversation();
      if (sampleName) {
        setStatus(`${sampleName} is a sample profile. Sign in to view your inbox, but messages cannot be delivered to this demo listing.`);
      }
      return;
    }

    currentProfile = await window.WefansDB.getProfile();
    authCard.hidden = true;
    messagesLayout.hidden = false;
    pageTitle.textContent = "Your conversations";
    pageDescription.textContent = `Signed in as ${currentProfile.display_name}. Messages are private to each client and freelancer.`;
    await loadConversations();
    await openRequestedConversation();
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authError.hidden = true;
    authSubmit.disabled = true;
    try {
      const formData = new FormData(authForm);
      window.WefansDB.setRememberSession(document.querySelector("#remember-session").checked);
      await window.WefansDB.signIn({
        email: String(formData.get("email")).trim(),
        password: String(formData.get("password"))
      });
    } catch (error) {
      authError.textContent = error.message || "Unable to sign in. Please try again.";
      authError.hidden = false;
    } finally {
      authSubmit.disabled = false;
    }
  });

  conversationList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-conversation-id]");
    if (!button) return;
    try {
      await activateConversation(button.dataset.conversationId);
      setStatus("");
    } catch (error) {
      reportError("Opening conversation", error);
    }
  });

  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = messageInput.value.trim();
    const conversation = conversations.find((item) => item.id === activeConversationId);
    if (!body || !conversation) return;
    sendButton.disabled = true;
    try {
      await window.WefansDB.sendMessage(conversation.id, body);
      messageInput.value = "";
      await loadConversations();
      await loadMessages(conversation.id);
      setStatus("");
    } catch (error) {
      reportError("Sending message", error);
    } finally {
      sendButton.disabled = false;
    }
  });

  async function initializeMessages() {
    if (!window.WefansDB.isConfigured()) {
      authCard.hidden = true;
      setStatus("Supabase messaging is not configured. Check the Wefans setup before using conversations.", true);
      return;
    }

    try {
      const result = await window.WefansDB.initialize();
      window.WefansDB.onAuthChange((user) => {
        window.setTimeout(() => {
          syncAccount(user).catch((error) => reportError("Loading your conversations", error));
        }, 0);
      });
      await syncAccount(result.user);
    } catch (error) {
      reportError("Connecting to Wefans messages", error);
    }
  }

  initializeMessages();
})();
