import type { SourceFile } from 'ts-morph';
import * as path from 'path';
import { cwd } from '../utils/index.js';
import type { ResolverFile, GenerateResolverFilesContext } from './types.js';
import type { ResolverTypingStyle } from '../validatePresetConfig/index.js';
import { ensureExportedResolver } from './ensureExportedResolver.js';
import {
  type AddedPropertyAssignmentNodes,
  addObjectTypeResolversPropertyAssignmentNodesIfNotImplemented,
} from './addObjectTypeResolversPropertyAssignmentNodesIfNotImplemented.js';
import { ensureEnumTypeResolversAreGenerated } from './ensureEnumTypeResolversAreGenerated.js';
import { getImportStatementWithExpectedNamedImport } from './getImportStatementWithExpectedNamedImport.js';

/**
 * postProcessFiles does static analysis on existing files OR to-be-generated files
 * e.g.
 * - Make sure correct variables are exported
 * - Make sure object types have field resolvers if mapper type's field cannot be used as schema type's field
 */
export const postProcessFiles = ({
  config: {
    tsMorph: { project },
    fixObjectTypeResolvers,
    resolverTypingStyle,
  },
  result,
}: GenerateResolverFilesContext): void => {
  const sourceFilesToProcess: {
    sourceFile: SourceFile;
    resolverFile: ResolverFile;
  }[] = [];

  // 1. Load resolver files into ts-morph project so we can run static analysis
  Object.entries(result.files).forEach(([filePath, file]) => {
    if (file.__filetype === 'file') {
      return;
    }

    const existingSourceFile = project.addSourceFileAtPathIfExists(filePath);
    if (existingSourceFile) {
      file.filesystem = {
        type: 'filesystem',
        contentUpdated: false,
      };
      sourceFilesToProcess.push({
        sourceFile: existingSourceFile,
        resolverFile: file,
      });
      return;
    }

    // If cannot find existing source files, load files that need post-processing into sourceFilesToProcess
    if (file.__filetype === 'objectType') {
      const virtualSourceFile = project.createSourceFile(
        filePath,
        file.content
      );
      sourceFilesToProcess.push({
        sourceFile: virtualSourceFile,
        resolverFile: file,
      });
    }
  });

  // `addedPropertyAssignmentNodes` is used to store added property assignments in object types
  // these property assigments are to be removed if there's no TypeScript error
  const addedPropertyAssignmentNodes: AddedPropertyAssignmentNodes = {};

  sourceFilesToProcess.forEach(({ sourceFile, resolverFile }) => {
    const normalizedRelativePath = path.posix.relative(
      cwd(),
      sourceFile.getFilePath()
    );

    const resolvedTypingStyle: ResolverTypingStyle =
      resolverFile.__filetype === 'rootObjectTypeFieldResolver'
        ? resolverTypingStyle[
            resolverFile.meta.belongsToRootObject.toLowerCase() as
              | 'query'
              | 'mutation'
              | 'subscription'
          ]
        : resolverTypingStyle.query;

    const { addedVariableStatement } = ensureExportedResolver(
      sourceFile,
      resolverFile,
      resolvedTypingStyle
    );

    if (
      resolverFile.__filetype !== 'scalarResolver' ||
      // For scalarResolver, only add `import { GraphQLScalarType } ...` if variable statement was added.
      // This is because user could have used custom scalar. If so, we don't want to add unnecessary import
      (resolverFile.__filetype === 'scalarResolver' && addedVariableStatement)
    ) {
      ensureImportedType(sourceFile, resolverFile);
    }

    if (
      (fixObjectTypeResolvers.object === 'smart' ||
        fixObjectTypeResolvers.object === 'fast') &&
      resolverFile.__filetype === 'objectType'
    ) {
      addObjectTypeResolversPropertyAssignmentNodesIfNotImplemented({
        addedPropertyAssignmentNodes,
        sourceFile,
        resolverFile,
        mode: fixObjectTypeResolvers.object,
      });
    }

    if (
      (fixObjectTypeResolvers.enum === 'smart' ||
        fixObjectTypeResolvers.enum === 'fast') &&
      resolverFile.__filetype === 'enumResolver'
    ) {
      ensureEnumTypeResolversAreGenerated(sourceFile, resolverFile);
    }

    // Overwrite existing files with fixes
    result.files[normalizedRelativePath] = {
      ...resolverFile,
      content: sourceFile.getText(),
    };
  });

  // 3. ensure object type's added property assignments are removed if there's no related TypeScript error
  // We do this only once at the project level instead of sourceFile level to speed up the process
  if (fixObjectTypeResolvers.object === 'smart') {
    project.getPreEmitDiagnostics().forEach((d) => {
      const filename = d.getSourceFile()?.getFilePath().toString();
      if (!filename || !addedPropertyAssignmentNodes[filename]) {
        return;
      }
      const lineNumberWithError = d.getLineNumber();

      // If erroring on a recently added line, do not remove as user needs to implement it
      if (
        lineNumberWithError &&
        addedPropertyAssignmentNodes[filename][lineNumberWithError]
      ) {
        addedPropertyAssignmentNodes[filename][
          lineNumberWithError
        ].__toBeRemoved = false;
      }
    });
    Object.values(addedPropertyAssignmentNodes).forEach((addedNodes) => {
      Object.values(addedNodes).forEach(
        ({ node, resolverFile, __toBeRemoved }) => {
          if (__toBeRemoved) {
            node.remove();
          } else {
            // If found a property assignment that cannot be removed i.e. incompatible types between mapper vs schema types
            // Then we must mark the content as updated to be added to generate list
            resolverFile.filesystem.contentUpdated = true;
          }
        }
      );
    });
  }

  // 4. Apply to result files the updated content done in step 2. and 3. above
  sourceFilesToProcess.forEach(({ sourceFile, resolverFile }) => {
    const normalizedRelativePath = path.posix.relative(
      cwd(),
      sourceFile.getFilePath()
    );

    // Overwrite existing files with fixes
    result.files[normalizedRelativePath] = {
      ...resolverFile,
      content: sourceFile.getText(),
    };
  });
};

/**
 * Ensure correctly imported resolves type generated by typescript-resolvers plugin
 */
const ensureImportedType = (
  sourceFile: SourceFile,
  resolverFile: ResolverFile
): void => {
  const { importDeclaration } = getImportStatementWithExpectedNamedImport(
    sourceFile,
    resolverFile
  );

  if (!importDeclaration) {
    sourceFile.insertStatements(
      0,
      resolverFile.meta.resolverTypeImportDeclaration
    );
    resolverFile.filesystem.contentUpdated = true;
  }
};
