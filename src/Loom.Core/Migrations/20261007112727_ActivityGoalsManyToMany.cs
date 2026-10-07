using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Loom.Core.Migrations
{
    /// <inheritdoc />
    public partial class ActivityGoalsManyToMany : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ActivityGoals",
                columns: table => new
                {
                    ActivityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    GoalId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActivityGoals", x => new { x.ActivityId, x.GoalId });
                    table.ForeignKey(
                        name: "FK_ActivityGoals_Activities_ActivityId",
                        column: x => x.ActivityId,
                        principalTable: "Activities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ActivityGoals_Goals_GoalId",
                        column: x => x.GoalId,
                        principalTable: "Goals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ActivityGoals_GoalId",
                table: "ActivityGoals",
                column: "GoalId");

            migrationBuilder.Sql(
                "INSERT INTO ActivityGoals (ActivityId, GoalId) SELECT Id, GoalId FROM Activities WHERE GoalId IS NOT NULL;");

            migrationBuilder.DropForeignKey(
                name: "FK_Activities_Goals_GoalId",
                table: "Activities");

            migrationBuilder.DropIndex(
                name: "IX_Activities_GoalId",
                table: "Activities");

            migrationBuilder.DropColumn(
                name: "GoalId",
                table: "Activities");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GoalId",
                table: "Activities",
                type: "TEXT",
                nullable: true);

            migrationBuilder.Sql(
                "UPDATE Activities SET GoalId = (SELECT MIN(GoalId) FROM ActivityGoals WHERE ActivityGoals.ActivityId = Activities.Id);");

            migrationBuilder.CreateIndex(
                name: "IX_Activities_GoalId",
                table: "Activities",
                column: "GoalId");

            migrationBuilder.AddForeignKey(
                name: "FK_Activities_Goals_GoalId",
                table: "Activities",
                column: "GoalId",
                principalTable: "Goals",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.DropTable(
                name: "ActivityGoals");
        }
    }
}
