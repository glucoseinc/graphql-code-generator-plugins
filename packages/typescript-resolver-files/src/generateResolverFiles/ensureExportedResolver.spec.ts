import * as path from 'path';
import { Project } from 'ts-morph';
import { ensureExportedResolver } from './ensureExportedResolver.js';
import type {
  RootObjectTypeFieldResolverFile,
  ObjectTypeFile,
  ScalarResolverFile,
} from './types.js';

const createFilePath = (filePath: string): string =>
  path.join('/path/', filePath);

const makeRootObjectTypeFieldResolverFile = (
  overrides: Partial<RootObjectTypeFieldResolverFile> = {}
): RootObjectTypeFieldResolverFile => ({
  __filetype: 'rootObjectTypeFieldResolver',
  filesystem: { type: 'filesystem', contentUpdated: false },
  content: '',
  mainImportIdentifier: 'me',
  meta: {
    moduleName: 'user',
    relativePathFromBaseToModule: ['user'],
    belongsToRootObject: 'Query',
    resolverTypeImportDeclaration:
      "import type { QueryResolvers } from '../types.generated';",
    variableStatement:
      "export const me = (async (_parent, _arg, _ctx) => { /* ... */ }) satisfies NonNullable<QueryResolvers['me']>;",
    resolverType: {
      baseImport: 'QueryResolvers',
      resolver: "QueryResolvers['me']",
      final: "NonNullable<QueryResolvers['me']>",
    },
    normalizedResolverName: {
      base: 'me',
      withModule: 'user/me',
    },
  },
  ...overrides,
});

describe("ensureExportedResolver() - resolverTypingStyle: 'satisfies'", () => {
  it('converts annotation style to satisfies style for a Query resolver', () => {
    const project = new Project();
    const sourceFile = project.createSourceFile(
      createFilePath('Query/me.ts'),
      `import type { QueryResolvers } from '../types.generated';
export const me: NonNullable<QueryResolvers['me']> = async (_parent, _arg, _ctx) => {
  /* Implement Query.me resolver logic here */
};`
    );
    const resolverFile = makeRootObjectTypeFieldResolverFile();

    ensureExportedResolver(sourceFile, resolverFile, 'satisfies');

    const text = sourceFile.getText();
    expect(text).toMatch(/export const me = \(/);
    expect(text).toContain(`satisfies NonNullable<QueryResolvers['me']>`);
    expect(text).not.toContain(`me: NonNullable<QueryResolvers['me']>`);
    expect(resolverFile.filesystem.contentUpdated).toBe(true);
  });

  it('converts annotation style to satisfies style for a Subscription resolver', () => {
    const project = new Project();
    const sourceFile = project.createSourceFile(
      createFilePath('Subscription/profileChanges.ts'),
      `import type { SubscriptionResolvers } from '../types.generated';
export const profileChanges: NonNullable<SubscriptionResolvers['profileChanges']> = {
  subscribe: async (_parent, _arg, _ctx) => {
    /* Implement Subscription.profileChanges resolver logic here */
  },
};`
    );
    const resolverFile: RootObjectTypeFieldResolverFile = {
      __filetype: 'rootObjectTypeFieldResolver',
      filesystem: { type: 'filesystem', contentUpdated: false },
      content: '',
      mainImportIdentifier: 'profileChanges',
      meta: {
        moduleName: 'subscription',
        relativePathFromBaseToModule: ['subscription'],
        belongsToRootObject: 'Subscription',
        resolverTypeImportDeclaration:
          "import type { SubscriptionResolvers } from '../types.generated';",
        variableStatement:
          "export const profileChanges = ({ subscribe: async (_parent, _arg, _ctx) => {} }) satisfies NonNullable<SubscriptionResolvers['profileChanges']>;",
        resolverType: {
          baseImport: 'SubscriptionResolvers',
          resolver: "SubscriptionResolvers['profileChanges']",
          final: "NonNullable<SubscriptionResolvers['profileChanges']>",
        },
        normalizedResolverName: {
          base: 'profileChanges',
          withModule: 'subscription/profileChanges',
        },
      },
    };

    ensureExportedResolver(sourceFile, resolverFile, 'satisfies');

    expect(sourceFile.getText()).toContain('satisfies');
    expect(sourceFile.getText()).not.toContain(
      'profileChanges: NonNullable<SubscriptionResolvers'
    );
    expect(resolverFile.filesystem.contentUpdated).toBe(true);
  });

  it('converts to satisfies style even when the existing type annotation is outdated', () => {
    const project = new Project();
    const sourceFile = project.createSourceFile(
      createFilePath('Query/me.ts'),
      `export const me: QueryResolvers['me'] = async (_parent, _arg, _ctx) => {};`
    );
    const resolverFile = makeRootObjectTypeFieldResolverFile();

    ensureExportedResolver(sourceFile, resolverFile, 'satisfies');

    expect(sourceFile.getText()).toContain(
      `satisfies NonNullable<QueryResolvers['me']>`
    );
    expect(resolverFile.filesystem.contentUpdated).toBe(true);
  });
});

describe("ensureExportedResolver() - resolverTypingStyle: 'annotation'", () => {
  it('converts satisfies style to annotation style for a Query resolver', () => {
    const project = new Project();
    const sourceFile = project.createSourceFile(
      createFilePath('Query/me.ts'),
      `import type { QueryResolvers } from '../types.generated';
export const me = (async (_parent, _arg, _ctx) => {
  /* Implement Query.me resolver logic here */
}) satisfies NonNullable<QueryResolvers['me']>;`
    );
    const resolverFile = makeRootObjectTypeFieldResolverFile();

    ensureExportedResolver(sourceFile, resolverFile, 'annotation');

    const text = sourceFile.getText();
    expect(text).toContain(
      `export const me: NonNullable<QueryResolvers['me']> = async (_parent, _arg, _ctx) => {`
    );
    expect(text).not.toContain('satisfies');
    expect(resolverFile.filesystem.contentUpdated).toBe(true);
  });

  it('updates the type annotation without changing style when file already uses annotation style', () => {
    const project = new Project();
    const sourceFile = project.createSourceFile(
      createFilePath('Query/me.ts'),
      `export const me: QueryResolvers['me'] = async (_parent, _arg, _ctx) => {};`
    );
    const resolverFile = makeRootObjectTypeFieldResolverFile();

    ensureExportedResolver(sourceFile, resolverFile, 'annotation');

    const text = sourceFile.getText();
    expect(text).toContain(`NonNullable<QueryResolvers['me']>`);
    expect(text).not.toContain('satisfies');
    expect(resolverFile.filesystem.contentUpdated).toBe(true);
  });
});

describe("ensureExportedResolver() - resolverTypingStyle: 'prefer-satisfies' / 'prefer-annotation'", () => {
  it("does not convert annotation style to satisfies style when resolverTypingStyle is 'prefer-satisfies'", () => {
    const project = new Project();
    const sourceFile = project.createSourceFile(
      createFilePath('Query/me.ts'),
      `export const me: NonNullable<QueryResolvers['me']> = async (_parent, _arg, _ctx) => {};`
    );
    const resolverFile = makeRootObjectTypeFieldResolverFile();

    ensureExportedResolver(sourceFile, resolverFile, 'prefer-satisfies');

    const text = sourceFile.getText();
    expect(text).toContain(`me: NonNullable<QueryResolvers['me']>`);
    expect(text).not.toContain('satisfies');
    expect(resolverFile.filesystem.contentUpdated).toBe(false);
  });

  it("does not convert satisfies style to annotation style when resolverTypingStyle is 'prefer-annotation'", () => {
    const project = new Project();
    const sourceFile = project.createSourceFile(
      createFilePath('Query/me.ts'),
      `export const me = (async (_parent, _arg, _ctx) => {}) satisfies NonNullable<QueryResolvers['me']>;`
    );
    const resolverFile = makeRootObjectTypeFieldResolverFile();

    ensureExportedResolver(sourceFile, resolverFile, 'prefer-annotation');

    const text = sourceFile.getText();
    expect(text).toContain('satisfies');
    expect(resolverFile.filesystem.contentUpdated).toBe(false);
  });
});

describe('ensureExportedResolver() - does not set contentUpdated when type is already up to date', () => {
  it('does not set contentUpdated when satisfies style type is already up to date', () => {
    const project = new Project();
    const sourceFile = project.createSourceFile(
      createFilePath('Query/me.ts'),
      `export const me = (async (_parent, _arg, _ctx) => {}) satisfies NonNullable<QueryResolvers['me']>;`
    );
    const resolverFile = makeRootObjectTypeFieldResolverFile();

    ensureExportedResolver(sourceFile, resolverFile, 'satisfies');

    expect(resolverFile.filesystem.contentUpdated).toBe(false);
  });

  it('does not set contentUpdated when only formatting differs', () => {
    const project = new Project();
    const sourceFile = project.createSourceFile(
      createFilePath('Book.ts'),
      `export const Book = ({}) satisfies Pick<
  BookResolvers,
  | 'title'
  | 'author'
>;`
    );
    const resolverFile: ObjectTypeFile = {
      __filetype: 'objectType',
      filesystem: { type: 'filesystem', contentUpdated: false },
      content: '',
      mainImportIdentifier: 'Book',
      meta: {
        moduleName: 'book',
        relativePathFromBaseToModule: ['book'],
        resolverTypeImportDeclaration:
          "import type { BookResolvers } from '../types.generated';",
        variableStatement:
          "export const Book = ({}) satisfies Pick<BookResolvers, 'title'|'author'>;",
        resolverType: {
          baseImport: 'BookResolvers',
          final: "Pick<BookResolvers, 'title'|'author'>",
          otherVariants: ["Pick<BookResolvers,|'title'|'author'>"],
        },
        normalizedResolverName: { base: 'Book', withModule: 'book/Book' },
      },
    };

    ensureExportedResolver(sourceFile, resolverFile, 'satisfies');

    expect(resolverFile.filesystem.contentUpdated).toBe(false);
  });
});

describe('ensureExportedResolver() - scalarResolver is not subject to type conversion', () => {
  it('does not apply type conversion to scalarResolver', () => {
    const project = new Project();
    const originalContent = `import { GraphQLScalarType } from 'graphql';
export const DateTime = new GraphQLScalarType({ name: 'DateTime' });`;
    const sourceFile = project.createSourceFile(
      createFilePath('scalars/DateTime.ts'),
      originalContent
    );
    const resolverFile: ScalarResolverFile = {
      __filetype: 'scalarResolver',
      filesystem: { type: 'filesystem', contentUpdated: false },
      content: originalContent,
      mainImportIdentifier: 'DateTime',
      meta: {
        moduleName: 'scalars',
        relativePathFromBaseToModule: ['scalars'],
        resolverTypeImportDeclaration:
          "import type { DateTimeScalarConfig } from '../types.generated';",
        variableStatement:
          "export const DateTime = new GraphQLScalarType({ name: 'DateTime' });",
        resolverType: {
          baseImport: 'DateTimeScalarConfig',
          final: 'DateTimeScalarConfig',
        },
        normalizedResolverName: {
          base: 'DateTime',
          withModule: 'scalars/DateTime',
        },
      },
    };

    ensureExportedResolver(sourceFile, resolverFile, 'satisfies');

    expect(sourceFile.getText()).toBe(originalContent);
    expect(resolverFile.filesystem.contentUpdated).toBe(false);
  });
});

describe('ensureExportedResolver() - when variableStatement is not found', () => {
  it('appends variableStatement to the end when the expected identifier is not found', () => {
    const project = new Project();
    const sourceFile = project.createSourceFile(
      createFilePath('Query/me.ts'),
      `import type { QueryResolvers } from '../types.generated';`
    );
    const variableStatement =
      "export const me = (async (_parent, _arg, _ctx) => { /* ... */ }) satisfies NonNullable<QueryResolvers['me']>;";
    const resolverFile = makeRootObjectTypeFieldResolverFile({
      meta: {
        ...makeRootObjectTypeFieldResolverFile().meta,
        variableStatement,
      },
    });

    const { addedVariableStatement } = ensureExportedResolver(
      sourceFile,
      resolverFile,
      'annotation'
    );

    expect(addedVariableStatement).toBe(true);
    expect(sourceFile.getText()).toContain(variableStatement);
    expect(resolverFile.filesystem.contentUpdated).toBe(true);
  });
});
