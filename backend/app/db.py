import chromadb

def get_chroma_client(path="chroma_db"):
    return chromadb.PersistentClient(path=path)

def get_collection(client, name="pdf_chunks"):
    return client.get_or_create_collection(name=name)
