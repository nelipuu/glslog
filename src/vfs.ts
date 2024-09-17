type NodeType = 'file' | 'dir';
type Children<Data> = { [name: string]: DirNode<Data> | FileNode<Data> };

interface TreeNode<Data> {
	name: string;
	type?: NodeType;
	parent?: DirNode<Data>;
}

interface DirNode<Data> extends TreeNode<Data> {
	type: 'dir';
	children: Children<Data>;
}

interface FileNode<Data> extends TreeNode<Data> {
	type: 'file';
	data: Data;
}

function isDir<Data>(node: TreeNode<Data>): node is DirNode<Data> {
	return node.type == 'dir';
}

function isFile<Data>(node: TreeNode<Data>): node is FileNode<Data> {
	return node.type == 'file';
}

export class VFS<Data = string | Uint8Array> {

	private find(path: string): DirNode<Data> | FileNode<Data> | null;
	private find(path: string, create: 'dir'): DirNode<Data> | null;
	private find(path: string, create: 'file'): FileNode<Data> | null;
	private find(path: string, create?: NodeType): TreeNode<Data> | null {
		const parts = path.split('/');
		let node: TreeNode<Data> = this.root;

		for(const part of parts) {
			if(!part) continue;

			if(!node.type) {
				node.type = 'dir';
				(node as DirNode<Data>).children = {};
			}

			if(!isDir(node)) return null;

			if(part in node.children) {
				node = node.children[part];
			} else if(!create) {
				return null;
			} else {
				node = node.children[part] = {
					name: part,
					parent: node
				} as DirNode<Data> | FileNode<Data>;
			}
		}

		if(create && node.type != create) {
			if(node.type) return null;
			node.type = create;

			if(create == 'dir') {
				(node as DirNode<Data>).children = {};
			}
		}

		return node;
	}

	public isDir(path: string): boolean {
		const node = this.find(path);
		return !!node && isDir(node);
	}

	public isFile(path: string): boolean {
		const node = this.find(path);
		return !!node && isFile(node);
	}

	public read(path: string): Data | null {
		const node = this.find(path);
		return (node && isFile(node)) ? node.data : null;
	}

	public create(path: string, init: (path: string) => Data): Data | null {
		const node = this.find(path, 'file');
		return node && (node.data || (node.data = init(path)));
	}

	public write(path: string, data: Data): Data | null {
		const node = this.find(path, 'file');
		return node && (node.data = data);
	}

	public readDir(path: string): string[] | null {
		const node = this.find(path);
		if(node && isDir(node)) return Object.keys(node.children);
		return null;
	}

	public mkdir(path: string): boolean {
		return !!this.find(path, 'dir');
	}

	private root: DirNode<Data> = { name: '', type: 'dir', children: {} };

}
