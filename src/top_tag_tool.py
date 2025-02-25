import json

# Load JSON data from file
with open('user_profile.json', 'r') as file:
    data = json.load(file)

# Open a new text file to write the output
with open('output.txt', 'w') as output_file:
    # Sort tags by score and find the top scoring tags
    top_tags = sorted(data['tag_scores'].items(), key=lambda x: x[1], reverse=True)
    output_file.write("Top Tags:\n")
    for tag, score in top_tags:
        output_file.write(f"{tag}: {score}\n")

    # Sort ratings by score and find the top scoring ratings
    top_ratings = sorted(data['rating_scores'].items(), key=lambda x: x[1], reverse=True)
    output_file.write("\nTop Ratings:\n")
    for rating, score in top_ratings:
        output_file.write(f"{rating}: {score}\n")

    # Write total likes and dislikes
    output_file.write("\nTotal Likes and Dislikes:\n")
    output_file.write(f"Total Liked: {data['total_liked']}\n")
    output_file.write(f"Total Disliked: {data['total_disliked']}\n")

print("Results have been written to output.txt")
