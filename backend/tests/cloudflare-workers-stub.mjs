class EmptyStatement {
  bind() {
    return this;
  }

  async first() {
    return null;
  }

  async all() {
    return { results: [], success: true, meta: {} };
  }

  async raw() {
    return [];
  }

  async run() {
    return { results: [], success: true, meta: { changes: 0 } };
  }
}

const DB = {
  prepare() {
    return new EmptyStatement();
  },
  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.all()));
  },
  async exec() {
    return { count: 0, duration: 0 };
  },
};

export const env = Object.freeze({ DB });
