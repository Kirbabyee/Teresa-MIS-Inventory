let mockSession = null;
const authSubscribers = new Set();

const notifyAuthChange = (event, session) => {
  for (const cb of authSubscribers) {
    cb(event, session);
  }
};

const createQueryBuilder = () => {
  const state = {
    payload: null,
    isList: true,
  };

  const builder = {
    select() {
      state.isList = true;
      return builder;
    },
    insert(payload) {
      state.payload = payload;
      state.isList = false;
      return builder;
    },
    update(payload) {
      state.payload = payload;
      state.isList = false;
      return builder;
    },
    upsert(payload) {
      state.payload = payload;
      state.isList = false;
      return builder;
    },
    delete() {
      state.payload = null;
      state.isList = false;
      return builder;
    },
    eq() {
      return builder;
    },
    ilike() {
      return builder;
    },
    in() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    maybeSingle() {
      state.isList = false;
      return builder;
    },
    single() {
      state.isList = false;
      return builder;
    },
    then(resolve, reject) {
      const data = state.isList
        ? []
        : Array.isArray(state.payload)
          ? state.payload[0] || null
          : state.payload;
      return Promise.resolve({ data, error: null, count: 0 }).then(resolve, reject);
    },
    catch(reject) {
      return Promise.resolve({ data: state.isList ? [] : null, error: null }).catch(reject);
    },
    finally(callback) {
      return Promise.resolve({ data: state.isList ? [] : null, error: null }).finally(callback);
    },
  };

  return builder;
};

export const supabase = {
  from() {
    return createQueryBuilder();
  },
  auth: {
    async getSession() {
      return { data: { session: mockSession }, error: null };
    },
    async signInWithPassword({ email }) {
      const user = {
        id: "mock-superadmin-id",
        email: String(email || "superadmin@local.test").trim().toLowerCase(),
        role: "superadmin",
        user_metadata: {
          role: "superadmin",
          name: "Superadmin",
        },
      };

      mockSession = {
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        user,
      };

      notifyAuthChange("SIGNED_IN", mockSession);

      return { data: { user, session: mockSession }, error: null };
    },
    async signOut() {
      mockSession = null;
      notifyAuthChange("SIGNED_OUT", null);
      return { error: null };
    },
    onAuthStateChange(callback) {
      authSubscribers.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe() {
              authSubscribers.delete(callback);
            },
          },
        },
      };
    },
  },
};

export const backend = {
  entities: new Proxy(
    {},
    {
      get() {
        return {
          async list() {
            return [];
          },
          async get() {
            return null;
          },
          async create(payload) {
            return payload || {};
          },
          async update(_id, payload) {
            return payload || {};
          },
          async delete() {
            return { success: true };
          },
        };
      },
    },
  ),
};
