// Many other configurations exist
import { azExtEsbuildConfigProd } from '@microsoft/vscode-azext-eng';
import { build } from 'esbuild';

await build(azExtEsbuildConfigProd);
