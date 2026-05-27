import { type SourceFile, SyntaxKind } from 'ts-morph';
import type { ResolverFile } from './types.js';
import type { ResolverTypingStyle } from '../validatePresetConfig/index.js';
import { getVariableStatementWithExpectedIdentifier } from './getVariableStatementWithExpectedIdentifier.js';

/**
 * Ensure correctly named resolvers are exported
 */
export const ensureExportedResolver = (
  sourceFile: SourceFile,
  resolverFile: ResolverFile,
  resolverTypingStyle: ResolverTypingStyle
): { addedVariableStatement: boolean } => {
  const { variableStatement, isExported } =
    getVariableStatementWithExpectedIdentifier(sourceFile, resolverFile);

  /**
   * If we found the variable statement replace its type with the expected resolver type string
   *
   * This is because we change the type of the resolver in some cases:
   * 1. When `extend type <Object>` is used, we might change its original type to the picked version
   *    e.g. `Book` might become `Pick<Book, 'title' | 'author'>`
   */
  let ensureCorrectResolverType: (() => void) | undefined = undefined;
  if (variableStatement && resolverFile.meta.resolverType?.final) {
    const variableDeclaration = variableStatement
      .getDeclarationList()
      .getDeclarations()[0];
    const typeNode = variableDeclaration?.getTypeNode();
    const satisfiesTypeNode = !typeNode
      ? variableDeclaration
          ?.getInitializer()
          ?.asKind(SyntaxKind.SatisfiesExpression)
          ?.getTypeNode()
      : undefined;

    const trimTypeString = (value: string): string =>
      value.replace(/[\n\r\s]/g, '');

    const getTypeVariants = (): string[] =>
      'otherVariants' in resolverFile.meta.resolverType
        ? [
            resolverFile.meta.resolverType.final,
            ...resolverFile.meta.resolverType.otherVariants,
          ]
        : [resolverFile.meta.resolverType.final];

    if (typeNode) {
      if (resolverTypingStyle === 'satisfies') {
        // annotation → satisfies conversion
        ensureCorrectResolverType = () => {
          const initializerText =
            variableDeclaration.getInitializer()?.getText() ?? '';
          variableDeclaration.removeType();
          variableDeclaration.setInitializer(
            `(${initializerText}) satisfies ${resolverFile.meta.resolverType.final}`
          );
          resolverFile.filesystem.contentUpdated = true;
        };
      } else {
        // annotation → annotation: update type text only
        ensureCorrectResolverType = () => {
          const trimmedCurrentType = trimTypeString(typeNode.getText());
          const trimmedVariants = getTypeVariants().map(trimTypeString);
          if (!trimmedVariants.find((v) => v === trimmedCurrentType)) {
            typeNode.replaceWithText(resolverFile.meta.resolverType.final);
            resolverFile.filesystem.contentUpdated = true;
          }
        };
      }
    } else if (satisfiesTypeNode) {
      if (resolverTypingStyle === 'annotation') {
        // satisfies → annotation conversion
        ensureCorrectResolverType = () => {
          const innerExprNode = variableDeclaration
            .getInitializerOrThrow()
            .asKindOrThrow(SyntaxKind.SatisfiesExpression)
            .getExpression();
          let innerText: string;
          if (innerExprNode.getKind() === SyntaxKind.ParenthesizedExpression) {
            innerText = innerExprNode
              .asKindOrThrow(SyntaxKind.ParenthesizedExpression)
              .getExpression()
              .getText();
          } else {
            innerText = innerExprNode.getText();
          }
          variableDeclaration.setType(resolverFile.meta.resolverType.final);
          variableDeclaration.setInitializer(innerText);
          resolverFile.filesystem.contentUpdated = true;
        };
      } else {
        // satisfies → satisfies: update type text only
        ensureCorrectResolverType = () => {
          const trimmedOriginalTypeString = trimTypeString(
            satisfiesTypeNode.getText()
          );
          satisfiesTypeNode.replaceWithText(
            resolverFile.meta.resolverType.final
          );

          const trimmedVariants = getTypeVariants().map(trimTypeString);
          if (!trimmedVariants.find((v) => v === trimmedOriginalTypeString)) {
            resolverFile.filesystem.contentUpdated = true;
          }
        };
      }
    } else {
      // no type: add annotation (for all options)
      ensureCorrectResolverType = () => {
        variableDeclaration.setType(resolverFile.meta.resolverType.final);
        resolverFile.filesystem.contentUpdated = true;
      };
    }
  }

  // For non-scalarResolver, ensure correct type is imported
  // For scalarResolver, we don't need to add type to the variable statement for a few reasons:
  // - For cases when we need to create a new GraphQLScalarType, it infer the type from `new GraphQLScalarType`
  // - For cases when there's custom user logic, it's up to the user to import the correct type or call `new GraphQLScalarType` by themselves
  if (
    resolverFile.__filetype !== 'scalarResolver' &&
    ensureCorrectResolverType
  ) {
    ensureCorrectResolverType();
  }

  if (!variableStatement) {
    // Did not find variable statement with expected identifier, add it to the end with a warning
    sourceFile.addStatements(resolverFile.meta.variableStatement);
    resolverFile.filesystem.contentUpdated = true;

    return { addedVariableStatement: true };
  } else if (variableStatement && !isExported) {
    // If has identifier but not exported
    // Add export keyword to statement
    const isExpectedIdentifierExported = Boolean(
      sourceFile
        .getExportedDeclarations()
        .get(resolverFile.mainImportIdentifier)
    );
    if (!isExpectedIdentifierExported) {
      variableStatement.setIsExported(true);
      resolverFile.filesystem.contentUpdated = true;
    }
    // else, if identifier's been exported do nothing
    return { addedVariableStatement: false };
  }

  return { addedVariableStatement: false };
};
